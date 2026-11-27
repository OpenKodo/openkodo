import type { OpenKodoHooks } from '../workspace-setup/openkodo-yaml-hook-types'
import type { Repo } from '../repository/repo-types'
import { isFolderRepo } from '../repository/repo-kind'

/** Folder workspaces share one directory, so openkodo.yaml default tabs would start again for every one. */
export function scopeHooksToRepoKind(
  repo: Pick<Repo, 'kind'>,
  hooks: OpenKodoHooks | null
): OpenKodoHooks | null {
  if (!hooks || !isFolderRepo(repo) || !hooks.defaultTabs) {
    return hooks
  }
  return { ...hooks, defaultTabs: undefined }
}
