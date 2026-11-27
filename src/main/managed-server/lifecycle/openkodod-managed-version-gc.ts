import type { NodeRuntimeTarget } from '../../../shared/node-runtime/node-runtime-pin'
import type { ServeReadiness } from '../../server/serve-readiness'
import { readOpenkododActivationRecord } from '../activation/openkodod-activation-record-store'
import {
  openkododSlotDir,
  resolveOpenkododSlotIdentity,
  type OpenkododSlotOptions
} from '../activation/openkodod-recovery-slot'
import { probeActiveOpenkododReadiness } from '../activation/openkodod-active-readiness'
import { gcOldOpenkododVersions } from '../install/openkodod-remote-gc'
import { nodeRuntimeStorePins } from '../install/pinned-runtime-host-target'

/** null proves no daemon; undefined means its version is unknown. */
export function provenLiveDaemonVersion(readiness: ServeReadiness): string | null | undefined {
  const daemon = readiness.health?.terminalDaemon
  if (daemon?.state === 'live' && daemon.buildVersion) {
    return daemon.buildVersion
  }
  return daemon?.state === 'absent' ? null : undefined
}

export type ManagedOpenkododPruneArgs = {
  slot: OpenkododSlotOptions
  serverTarget: NodeRuntimeTarget
  activeVersion: string
  readiness: ServeReadiness
  keepStagedWithinDays?: number
}

/** True only when GC ran and left no stale version dir behind. */
export async function pruneManagedOpenkododVersions(
  args: ManagedOpenkododPruneArgs
): Promise<boolean> {
  const liveDaemonVersion = provenLiveDaemonVersion(args.readiness)
  // Unknown daemon versions could still execute from any candidate tree; skip GC.
  if (liveDaemonVersion === undefined) {
    return false
  }
  try {
    return await gcOldOpenkododVersions({
      conn: args.slot.conn,
      host: args.slot.host,
      remoteHome: args.slot.remoteHome,
      currentDirAbsPath: openkododSlotDir(args.slot, args.activeVersion),
      record: await readOpenkododActivationRecord(args.slot),
      liveDaemonVersion,
      // Default and compat builds share one runtime store.
      nodeRuntimePins: nodeRuntimeStorePins(args.serverTarget),
      ...(args.keepStagedWithinDays !== undefined
        ? { keepStagedWithinDays: args.keepStagedWithinDays }
        : {}),
      signal: args.slot.signal
    })
  } catch (error) {
    // Cleanup must not fail completed deploys; later connects retry.
    console.warn('[openkodod-gc] Pruning old openkodod versions failed:', error)
    return false
  }
}

/** GC otherwise runs only after an activation, so each deferred release left its staged slot behind (#34149). */
export async function pruneSupersededOpenkododCandidates(
  slot: OpenkododSlotOptions,
  serverTarget: NodeRuntimeTarget,
  candidateVersion: string
): Promise<void> {
  let readiness: ServeReadiness
  try {
    const active = (await readOpenkododActivationRecord(slot)).active
    if (!active) {
      return
    }
    readiness = await probeOpenkododSlotReadiness(slot, active)
  } catch (error) {
    // Without the incumbent's daemon version a staged tree may still be executing.
    console.warn('[openkodod-gc] Skipped pruning staged openkodod versions:', error)
    return
  }
  await pruneManagedOpenkododVersions({
    slot,
    serverTarget,
    activeVersion: candidateVersion,
    readiness,
    keepStagedWithinDays: STAGED_BUILD_KEEP_DAYS
  })
}

/** Readiness of the openkodod serving `version`, which names its live terminal daemon's build. */
export async function probeOpenkododSlotReadiness(
  slot: OpenkododSlotOptions,
  version: string
): Promise<ServeReadiness> {
  const identity = await resolveOpenkododSlotIdentity(slot, version)
  return probeActiveOpenkododReadiness(
    { ...slot, remoteInstallDir: identity.remoteDir },
    { buildHash: identity.buildHash, fullVersion: identity.version }
  )
}

// Desktops on different releases share hosts; without a grace period each re-uploads what the other pruned.
const STAGED_BUILD_KEEP_DAYS = 3
