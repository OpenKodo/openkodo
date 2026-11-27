import type { FolderWorkspace } from '../../../../shared/folder-workspaces/folder-workspace-types'
import {
  serializeOpenkododMigrationValue,
  type OpenkododMigrationImportReceipt,
  type OpenkododMigrationManifest
} from '../../../../shared/openkodod-migration/openkodod-migration-manifest'
import type { ProjectGroup } from '../../../../shared/project/groups/project-group-types'
import type { Repo } from '../../../../shared/repository/repo-types'
import { normalizeRuntimePathForComparison } from '../../../../shared/file-access/cross-platform-path'
import { isRepoOnCatalogHost } from '../../../../shared/execution-host/execution-host'
import { assertOpenkododMigrationStagedCatalogClaims } from './openkodod-staged-catalog-claims'
import {
  toOpenkododDestinationFolderWorkspace,
  toOpenkododDestinationProjectGroup,
  toOpenkododDestinationRepository
} from '../destination/openkodod-destination-catalog-projection'
import {
  syncProjectHostSetupCompatibilityState,
  type RepoLifecycleOperations
} from '../../loading-store/project-catalog/repo-lifecycle-operations'
import type { StoreRuntimeState } from '../../loading-store/store-runtime-state'
import {
  applyPreparedOpenkododMigrationDormantState,
  prepareOpenkododMigrationDormantState,
  type PreparedOpenkododMigrationDormantState
} from '../destination/openkodod-dormant-state-records'
import {
  sameOpenkododRepositoryConfiguration,
  selectNewRows
} from './openkodod-catalog-row-identity'

export type PreparedOpenkododMigrationCatalog = {
  repositories: Repo[]
  projectGroups: ProjectGroup[]
  folderWorkspaces: FolderWorkspace[]
  newRepositories: Repo[]
  newProjectGroups: ProjectGroup[]
  newFolderWorkspaces: FolderWorkspace[]
  dormantState: PreparedOpenkododMigrationDormantState
}

export function assertSameOpenkododMigrationManifest(
  staged: OpenkododMigrationManifest,
  requested: OpenkododMigrationManifest
): void {
  if (staged.manifestSha256 !== requested.manifestSha256) {
    throw new Error('openkodod_migration_id_reused_with_different_manifest')
  }
}

// No live PTY migrates, so compare the incoming dormant session as is.
export function prepareOpenkododMigrationCatalog(
  manifest: OpenkododMigrationManifest,
  state: StoreRuntimeState['state']
): PreparedOpenkododMigrationCatalog {
  assertOpenkododMigrationStagedCatalogClaims(
    manifest,
    state.openkododMigrationStagedCatalogs ?? []
  )
  const repositories = manifest.payload.repositories.map(toOpenkododDestinationRepository)
  const projectGroups = manifest.payload.projectGroups.map(toOpenkododDestinationProjectGroup)
  const folderWorkspaces = manifest.payload.folderWorkspaces.map(
    toOpenkododDestinationFolderWorkspace
  )
  const newRepositories = selectNewRows(
    repositories,
    state.repos,
    catalogConflict('repository'),
    sameOpenkododRepositoryConfiguration
  )
  const newProjectGroups = selectNewRows(
    projectGroups,
    state.projectGroups,
    catalogConflict('project_group')
  )
  const newFolderWorkspaces = selectNewRows(
    folderWorkspaces,
    state.folderWorkspaces,
    catalogConflict('folder_workspace')
  )
  assertNoRepositoryPathConflicts(repositories, state.repos)
  assertCatalogReferences({
    repositories,
    projectGroups,
    folderWorkspaces,
    existingProjectGroups: state.projectGroups
  })
  const dormantState = prepareOpenkododMigrationDormantState(manifest, state)
  return {
    repositories,
    projectGroups,
    folderWorkspaces,
    newRepositories,
    newProjectGroups,
    newFolderWorkspaces,
    dormantState
  }
}

export function applyPreparedOpenkododMigrationCatalog(
  prepared: PreparedOpenkododMigrationCatalog,
  state: StoreRuntimeState['state'],
  repos: RepoLifecycleOperations
): void {
  state.projectGroups.push(...prepared.newProjectGroups)
  state.repos.push(...prepared.newRepositories)
  state.folderWorkspaces.push(...prepared.newFolderWorkspaces)
  applyPreparedOpenkododMigrationDormantState(prepared.dormantState, state)
  if (prepared.newRepositories.length > 0) {
    syncProjectHostSetupCompatibilityState(repos)
  }
}

export function assertOpenkododMigrationReceiptMatchesManifest(
  receipt: OpenkododMigrationImportReceipt,
  manifest: OpenkododMigrationManifest
): void {
  const expected = {
    source: manifest.source,
    repositoryIds: manifest.payload.repositories.map((repo) => repo.id),
    projectGroupIds: manifest.payload.projectGroups.map((group) => group.id),
    folderWorkspaceIds: manifest.payload.folderWorkspaces.map((workspace) => workspace.id)
  }
  const actual = {
    source: receipt.source,
    repositoryIds: receipt.repositoryIds,
    projectGroupIds: receipt.projectGroupIds,
    folderWorkspaceIds: receipt.folderWorkspaceIds
  }
  if (serializeOpenkododMigrationValue(actual) !== serializeOpenkododMigrationValue(expected)) {
    throw new Error('openkodod_migration_receipt_manifest_mismatch')
  }
}

function catalogConflict(label: string): (id: string) => string {
  return (id) => `openkodod_migration_${label}_id_conflict:${id}`
}

function assertNoRepositoryPathConflicts(incoming: Repo[], existing: Repo[]): void {
  const incomingIdSet = new Set(incoming.map((repo) => repo.id))
  const incomingByPath = new Map<string, string>()
  for (const repo of incoming) {
    const key = normalizeRuntimePathForComparison(repo.path)
    const priorId = incomingByPath.get(key)
    if (priorId && priorId !== repo.id) {
      throw new Error(`openkodod_migration_repository_path_conflict:${repo.path}`)
    }
    incomingByPath.set(key, repo.id)
  }
  // Same-path rows on other hosts represent different checkouts.
  for (const repo of existing.filter(isRepoOnCatalogHost)) {
    if (
      !incomingIdSet.has(repo.id) &&
      incomingByPath.has(normalizeRuntimePathForComparison(repo.path))
    ) {
      throw new Error(`openkodod_migration_repository_path_conflict:${repo.path}`)
    }
  }
}

function assertCatalogReferences(args: {
  repositories: Repo[]
  projectGroups: ProjectGroup[]
  folderWorkspaces: FolderWorkspace[]
  existingProjectGroups: ProjectGroup[]
}): void {
  const groupIds = new Set([
    ...args.existingProjectGroups.map((group) => group.id),
    ...args.projectGroups.map((group) => group.id)
  ])
  for (const group of args.projectGroups) {
    if (group.parentGroupId && !groupIds.has(group.parentGroupId)) {
      throw new Error(`openkodod_migration_project_group_parent_missing:${group.id}`)
    }
  }
  for (const repo of args.repositories) {
    if (repo.projectGroupId && !groupIds.has(repo.projectGroupId)) {
      throw new Error(`openkodod_migration_repository_project_group_missing:${repo.id}`)
    }
  }
  for (const workspace of args.folderWorkspaces) {
    if (!groupIds.has(workspace.projectGroupId)) {
      throw new Error(`openkodod_migration_folder_workspace_project_group_missing:${workspace.id}`)
    }
  }
}
