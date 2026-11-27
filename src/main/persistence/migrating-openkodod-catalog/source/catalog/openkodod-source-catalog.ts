import type { OpenkododMigrationCatalogPayload } from '../../../../../shared/openkodod-migration/openkodod-migration-manifest'
import { withoutOpenkododRetainedMarker } from '../../../../../shared/remote-runtime/openkodod-lifecycle/openkodod-retained-marker'
import type { ProjectGroup } from '../../../../../shared/project/groups/project-group-types'
import type { SshTarget } from '../../../../../shared/remote-runtime/ssh/ssh-types'
import type { Store } from '../../../loading-store/store'
import {
  openkododSourceFolderWorkspaceIds,
  repoBelongsToOpenkododSource
} from './openkodod-source-ownership'

type OpenkododSourceCatalogStore = Pick<
  Store,
  'getFolderWorkspaces' | 'getProjectGroups' | 'getRepos'
>

export function collectOpenkododMigrationSourceCatalog(
  store: OpenkododSourceCatalogStore,
  target: Pick<SshTarget, 'id'>
): OpenkododMigrationCatalogPayload {
  const allRepos = store.getRepos()
  const allGroups = store.getProjectGroups()
  const allFolders = store.getFolderWorkspaces()
  const repositories = allRepos
    .filter((repo) => repoBelongsToOpenkododSource(repo, target.id))
    .map(withoutOpenkododRetainedMarker)
  const ownedFolderIds = openkododSourceFolderWorkspaceIds(
    { repos: allRepos, projectGroups: allGroups, folderWorkspaces: allFolders },
    target.id
  )
  const folderWorkspaces = allFolders
    .filter((workspace) => ownedFolderIds.has(workspace.id))
    .map(withoutOpenkododRetainedMarker)
  const projectGroups = collectProjectGroups(
    allGroups,
    new Set([
      ...repositories.flatMap((repo) => (repo.projectGroupId ? [repo.projectGroupId] : [])),
      ...folderWorkspaces.map((workspace) => workspace.projectGroupId),
      ...allGroups.filter((group) => group.connectionId === target.id).map((group) => group.id)
    ])
  )
  return { repositories, projectGroups, folderWorkspaces }
}

export function collectProjectGroups(
  groups: ProjectGroup[],
  initialIds: ReadonlySet<string>
): ProjectGroup[] {
  const byId = new Map(groups.map((group) => [group.id, group]))
  const includedIds = new Set(initialIds)
  const pending = [...initialIds]
  while (pending.length > 0) {
    const nextId = pending.pop()
    if (!nextId) {
      continue
    }
    const group = byId.get(nextId)
    if (!group?.parentGroupId || includedIds.has(group.parentGroupId)) {
      continue
    }
    includedIds.add(group.parentGroupId)
    pending.push(group.parentGroupId)
  }
  return groups.filter((group) => includedIds.has(group.id)).map((group) => structuredClone(group))
}
