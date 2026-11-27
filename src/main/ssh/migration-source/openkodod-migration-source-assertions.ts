import { createHash } from 'node:crypto'
import {
  serializeOpenkododMigrationValue,
  type OpenkododMigrationManifest
} from '../../../shared/openkodod-migration/openkodod-migration-manifest'
import type { OpenkododMigrationSourceCutover } from '../../../shared/openkodod-migration/openkodod-migration-source-cutover'
import {
  exportOpenkododMigrationManifest,
  type OpenkododMigrationExportedBlob
} from '../../persistence/migrating-openkodod-catalog/source/catalog/openkodod-migration-manifest-export'
import { resolveOpenkododMigrationFence } from './openkodod-migration-source-fence'
import { confirmOpenkododMigrationTerminalsUnderFence } from './openkodod-migration-terminal-gate'
import { collectUntransferredDependentBlockers } from '../targets/ssh-target-openkodod-dependents'
import type { OpenkododMigrationPreflightStore } from '../targets/ssh-target-openkodod-preflight'

/** Returns the re-read bytes of the blobs the journaled manifest names; unchanged source proves them. */
export function assertOpenkododMigrationSourceUnchanged(
  context: { userDataPath: string; store: OpenkododMigrationPreflightStore },
  cutover: OpenkododMigrationSourceCutover
): OpenkododMigrationExportedBlob[] {
  const target = context.store.getSshTarget(cutover.sshTargetId)
  const fence = target ? resolveOpenkododMigrationFence(context.userDataPath, target) : null
  if (!target || fence?.state !== 'fenced' || fence.cutover.migrationId !== cutover.migrationId) {
    throw new Error('openkodod_migration_source_fence_lost')
  }
  // Re-export with journaled identity/time/destination so only source changes affect comparison.
  const { manifest: current, blobs } = exportOpenkododMigrationManifest(context.store, target, {
    migrationId: cutover.migrationId,
    destinationEnvironmentId: cutover.destinationEnvironmentId,
    now: () => new Date(cutover.manifest.createdAt),
    inlineAutomationRuns: cutover.manifest.payload.dormantState?.automationRuns !== undefined
  })
  if (frozenSourceDigest(current) !== frozenSourceDigest(cutover.manifest)) {
    throw new Error('openkodod_migration_source_changed')
  }
  if (collectUntransferredDependentBlockers(context.store, cutover.manifest).length > 0) {
    throw new Error('openkodod_migration_source_dependencies_present')
  }
  const terminals = confirmOpenkododMigrationTerminalsUnderFence(
    context.store,
    target.id,
    cutover.bridgedPtyIds
      ? {
          verdict: 'bridged',
          relayVerdict: 'unverifiable',
          bridgedPtyIds: cutover.bridgedPtyIds,
          hostTerminals: 0
        }
      : { verdict: 'exited', provenPtyIds: cutover.provenPtyIds }
  )
  if (terminals.verdict === 'live' || terminals.verdict === 'unverifiable') {
    throw new Error(`openkodod_migration_source_terminals_${terminals.verdict}`)
  }
  return blobs
}

/** Ignore mutable UI layout/focus/routing: the destination gets the journaled view, and tab churn must not invalidate migration. */
function frozenSourceDigest(manifest: OpenkododMigrationManifest): string {
  const { manifestSha256: _digest, payload, ...rest } = manifest
  const {
    version: _version,
    workspaceSession: _session,
    clientState: _client,
    // Retention preserves journaled bytes even if their tab closes during transfer.
    terminalScrollbackSnapshots: _snapshots,
    ...dormant
  } = payload.dormantState ?? {}
  // UI-only changes can introduce a dormant payload that export previously omitted as empty.
  const empty = Object.values(dormant).every(
    (value) => value === undefined || (Array.isArray(value) && value.length === 0)
  )
  const frozen = { ...rest, payload: { ...payload, dormantState: empty ? undefined : dormant } }
  return createHash('sha256').update(serializeOpenkododMigrationValue(frozen)).digest('hex')
}
