// Export only additions from older builds by subtracting prior migrations from a profile copy.
import type {
  OpenkododMigrationCatalogPayload,
  OpenkododMigrationDormantStatePayload,
  OpenkododMigrationManifest,
  OpenkododMigrationManifestSource
} from '../../../../../shared/openkodod-migration/openkodod-migration-manifest'
import type { FolderWorkspace } from '../../../../../shared/folder-workspaces/folder-workspace-types'
import type { ProjectGroup } from '../../../../../shared/project/groups/project-group-types'
import type { Repo } from '../../../../../shared/repository/repo-types'
import type { StoreRuntimeState } from '../../../loading-store/store-runtime-state'
import { subtractOpenkododSourceCatalogState } from './openkodod-source-catalog-subtraction'
import {
  collectOpenkododMigrationUntransferredDependencyCensus,
  type OpenkododMigrationSourceDependencyCensus
} from '../sessions/openkodod-source-dependency-census'
import { subtractOpenkododMigrationSourceDormantState } from '../dormancy/openkodod-source-dormant-subtraction'
import { collectOpenkododMigrationSourceDormantState } from '../dormancy/openkodod-source-dormant-state'
import { subtractOpenkododMigrationScopeWorkspaceSession } from '../sessions/openkodod-source-workspace-session-subtraction'

export type OpenkododMigrationDeltaView = {
  getRepos: () => Repo[]
  getFolderWorkspaces: () => FolderWorkspace[]
  getProjectGroups: () => ProjectGroup[]
  collectOpenkododMigrationSourceDormantState: (
    source: OpenkododMigrationManifestSource,
    catalog: OpenkododMigrationCatalogPayload,
    destinationEnvironmentId?: string
  ) => OpenkododMigrationDormantStatePayload
  inspectOpenkododMigrationUntransferredDependencies: (
    manifest: OpenkododMigrationManifest
  ) => OpenkododMigrationSourceDependencyCensus
}

/** moved includes today's edits to previously migrated rows. */
export function createOpenkododMigrationDeltaView(
  runtime: Pick<StoreRuntimeState, 'state' | 'terminalScrollbackSnapshotStorage'>,
  moved: OpenkododMigrationManifest
): OpenkododMigrationDeltaView {
  const state = structuredClone(runtime.state)
  subtractOpenkododSourceCatalogState(state, moved)
  subtractOpenkododMigrationSourceDormantState(state, moved)
  // The server owns the moved projects' tabs now, even ones the older build left unmovable.
  subtractOpenkododMigrationScopeWorkspaceSession(state, moved)
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
