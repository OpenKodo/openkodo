import type { OpenkododMigrationManifest } from '../../../../../shared/openkodod-migration/openkodod-migration-manifest'
import type { PersistedState } from '../../../../../shared/openkodo-profiles/persisted-state-types'
import { subtractOpenkododSourceWorktreeMetadata } from '../worktrees/openkodod-source-worktree-metadata'
import { subtractOpenkododMigrationSourceAutomationState } from '../automations/openkodod-source-automation-subtraction'
import { subtractOpenkododMigrationSourceWorkspaceSession } from '../sessions/openkodod-source-workspace-session-subtraction'
import { subtractOpenkododMigrationClientState } from '../clients/openkodod-source-client-subtraction'

/** Mutate a delta-view copy only. */
export function subtractOpenkododMigrationSourceDormantState(
  state: PersistedState,
  manifest: OpenkododMigrationManifest
): void {
  // Include state a downgraded build added even when the manifest had none.
  subtractOpenkododSourceWorktreeMetadata(state, manifest)
  subtractOpenkododMigrationSourceAutomationState(state, manifest)
  const dormant = manifest.payload.dormantState
  if (!dormant) {
    return
  }
  dormant.worktreeLineage.forEach((entry) => delete state.worktreeLineageById[entry.sourceKey])
  dormant.workspaceLineage.forEach(
    (entry) => delete state.workspaceLineageByChildKey[entry.sourceKey]
  )
  for (const preset of dormant.sparsePresets) {
    const remaining = (state.sparsePresetsByRepo[preset.repoId] ?? []).filter(
      (entry) => entry.id !== preset.id
    )
    if (remaining.length > 0) {
      state.sparsePresetsByRepo[preset.repoId] = remaining
    } else {
      delete state.sparsePresetsByRepo[preset.repoId]
    }
  }
  for (const entry of dormant.retiredWorktreeNames) {
    delete state.retiredWorktreeNamesByRepo?.[entry.repoId]
  }
  subtractOpenkododMigrationSourceWorkspaceSession(state, manifest)
  subtractOpenkododMigrationClientState(state, manifest)
  // Retain snapshot files: the prior durable profile and rollback evidence can still reference them.
}
