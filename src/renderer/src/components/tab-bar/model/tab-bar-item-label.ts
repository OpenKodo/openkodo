import type { TabBarItem } from './tab-bar-item-model'
import { resolveTerminalTabTitle } from '../../../../../shared/workspace-layout/tab-groups/tab-title-resolution'
import { getEditorDisplayLabel } from '@/components/editor/panel/header/editor-labels'
import { getBrowserTabLabel } from '../browser-tabs/browser-tab-label'
import type { Translate } from '@/i18n/use-translate'

export function tabItemLabel(
  item: TabBarItem,
  generatedTitlesEnabled: boolean,
  savedName: string | null,
  t?: Translate
): string {
  if (item.type === 'terminal') {
    return resolveTerminalTabTitle(item.data, generatedTitlesEnabled, item.data.title)
  }
  if (item.type === 'browser') {
    return getBrowserTabLabel(item.data, t)
  }
  if (item.type === 'agent-session') {
    return savedName ?? item.data.label
  }
  if (item.type === 'room') {
    return item.data.customLabel ?? item.data.label
  }
  return getEditorDisplayLabel(item.data, undefined, t)
}
