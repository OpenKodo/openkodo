import {
  planManagedOpenkododAutoUpdate,
  type ManagedOpenkododAutoUpdateSkip
} from './openkodod-managed-update-decision'
import { OpenkododCrashLoopError } from './openkodod-managed-crash-loop'
import { materializeOpenkododArtifact } from '../../openkodod/artifact-slots/openkodod-artifact-materializer'
import {
  OpenkododArtifactsUnavailableError,
  OpenkododHostUnsupportedError
} from '../../openkodod/diagnostics/openkodod-host-unavailable'
import { findIncompleteManagedOpenkododMigration } from './openkodod-managed-migration-status'
import { OPENKODOD_ACTIVATION_FENCE_BUSY_CODE } from '../activation/openkodod-activation-fence-hold'
import { resolveLinkedOpenkododContext } from './openkodod-managed-runtime-context'
import { runManagedOpenkododUpdate } from './openkodod-runtime-maintenance'
import { withManagedOpenkododLifecycle } from './openkodod-managed-lifecycle'
import type { OpenkododUpdateDeferCode } from '../activation/openkodod-update-plan'
import { readLocalFullVersion } from '../install/remote-versioned-install'

export type ManagedOpenkododAutoUpdateOutcome =
  | { outcome: 'skipped'; reason: ManagedOpenkododAutoUpdateSkip }
  | { outcome: 'updated'; activeVersion: string }
  | { outcome: 'deferred'; code: string; reason: string }
  /** Candidate rejection or update failure; consult host state before assuming the incumbent serves. */
  | { outcome: 'failed'; reason: string }

const WAITING_CODES: ReadonlySet<string> = new Set<
  OpenkododUpdateDeferCode | typeof OPENKODOD_ACTIVATION_FENCE_BUSY_CODE
>([
  OPENKODOD_ACTIVATION_FENCE_BUSY_CODE,
  'openkodod_update_terminals_running',
  'openkodod_update_terminal_census_unavailable',
  'openkodod_update_strands_live_terminals',
  'openkodod_update_daemon_protocol_unverifiable',
  'openkodod_update_ends_in_process_terminals'
])

/** Temporary deferrals retry on later connects; interrupted activations require recovery. */
export function isWaitingOpenkododUpdateDeferral(code: string): boolean {
  return WAITING_CODES.has(code)
}

export async function autoUpdateManagedOpenkododEnvironment(
  userDataPath: string,
  args: {
    environmentId: string
    appVersion: string
    /** Read under the lifecycle lock to observe prior overlapping attempts. */
    failedBefore: () => boolean
    onUpdating: () => void
  }
): Promise<ManagedOpenkododAutoUpdateOutcome> {
  return await withManagedOpenkododLifecycle(userDataPath, args.environmentId, async (managed) => {
    // Restarting during migration would race cutover staging.
    if (findIncompleteManagedOpenkododMigration(userDataPath, managed.environment.id)) {
      return { outcome: 'skipped', reason: 'migrating' }
    }
    const context = await resolveLinkedOpenkododContext(managed.environment, managed.deployment)
    const candidateVersion = await bundledManagedOpenkododVersion(context.serverTarget)
    const plan = planManagedOpenkododAutoUpdate({
      record: context.activationRecord,
      candidateVersion,
      appVersion: args.appVersion,
      failedBefore: args.failedBefore()
    })
    if (plan.action === 'skip') {
      return { outcome: 'skipped', reason: plan.reason }
    }
    args.onUpdating()
    let lockedSkip: ManagedOpenkododAutoUpdateSkip | null = null
    try {
      const result = await runManagedOpenkododUpdate(userDataPath, managed, context, {
        // Another desktop may activate or stop a newer build during upload; recheck under the fence.
        admitRecord: (record) => {
          const locked = planManagedOpenkododAutoUpdate({
            record,
            candidateVersion,
            appVersion: args.appVersion,
            failedBefore: false
          })
          if (locked.action === 'update') {
            return null
          }
          lockedSkip = locked.reason
          return `Auto-update skipped under the host fence: ${locked.reason}.`
        }
      })
      if (lockedSkip) {
        return { outcome: 'skipped', reason: lockedSkip }
      }
      if (result.outcome !== 'deferred') {
        return { outcome: 'updated', activeVersion: result.activeVersion }
      }
      return isWaitingOpenkododUpdateDeferral(result.code)
        ? { outcome: 'deferred', code: result.code, reason: result.reason }
        : { outcome: 'failed', reason: result.reason }
    } catch (error) {
      // The host already runs this build; the brake's reason shows on its server status instead.
      if (error instanceof OpenkododCrashLoopError) {
        return { outcome: 'skipped', reason: 'current' }
      }
      return { outcome: 'failed', reason: error instanceof Error ? error.message : String(error) }
    }
  })
}

type OpenkododTarget = Parameters<typeof materializeOpenkododArtifact>[0]

// Packaged templates cannot change during this session; avoid repeated hashing.
const bundledVersions = new Map<OpenkododTarget, Promise<string | null>>()

/** This build's openkodod version for `target`; null when the build bundles none for it. */
export function bundledManagedOpenkododVersion(target: OpenkododTarget): Promise<string | null> {
  let version = bundledVersions.get(target)
  if (!version) {
    version = materializeOpenkododArtifact(target).then(readLocalFullVersion, (error: unknown) => {
      if (
        error instanceof OpenkododHostUnsupportedError ||
        error instanceof OpenkododArtifactsUnavailableError
      ) {
        return null
      }
      throw error
    })
    // A transient local failure must not stick for the session.
    version.catch(() => bundledVersions.delete(target))
    bundledVersions.set(target, version)
  }
  return version
}
