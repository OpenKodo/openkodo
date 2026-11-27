// Offer "Move anyway" only when a consent-free preview shows it clears the blockers.
import type { StoreRuntimeState } from '../../../loading-store/store-runtime-state'
import { collectOpenkododMigrationUntransferredDependencyCensus } from '../sessions/openkodod-source-dependency-census'
import { collectOpenkododMigrationSourceDormantState } from '../dormancy/openkodod-source-dormant-state'
import type { OpenkododMigrationDeltaView } from './openkodod-source-delta-view'

export function createOpenkododMigrationLeaveBehindView(
  runtime: Pick<StoreRuntimeState, 'state' | 'terminalScrollbackSnapshotStorage'>,
  targetId: string
): OpenkododMigrationDeltaView {
  // Read-only collectors make a shallow copy sufficient.
  const state = {
    ...runtime.state,
    sshTargets: runtime.state.sshTargets.map((target) =>
      target.id === targetId
        ? { ...target, managedServerLeaveBehind: { confirmedAt: new Date(0).toISOString() } }
        : target
    )
  }
  const storage = runtime.terminalScrollbackSnapshotStorage
  return {
    getRepos: () => state.repos,
    getFolderWorkspaces: () => state.folderWorkspaces,
    getProjectGroups: () => state.projectGroups,
    collectOpenkododMigrationSourceDormantState: (source, catalog, destinationEnvironmentId) =>
      collectOpenkododMigrationSourceDormantState(
        state,
        source,
        catalog,
        storage,
        destinationEnvironmentId
      ).payload,
    inspectOpenkododMigrationUntransferredDependencies: (manifest) =>
      collectOpenkododMigrationUntransferredDependencyCensus(state, manifest, storage)
  }
}
