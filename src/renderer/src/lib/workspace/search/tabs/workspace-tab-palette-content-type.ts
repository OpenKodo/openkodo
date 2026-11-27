import type { TabContentType } from '../../../../../../shared/workspace-layout/tab-groups/tab-types'
import type { WorkspaceTabContentType } from './workspace-tab-search-types'

// Why exclusion: browser tabs have their own palette row; every other tab kind is a
// workspace tab, so a new kind reaches the entry builder, which then needs a branch to title it.
export function isWorkspaceTabContentType(
  contentType: TabContentType
): contentType is WorkspaceTabContentType {
  return contentType !== 'browser'
}
