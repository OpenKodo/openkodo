import React from 'react'
import { FilePlus, FileText, Globe, TerminalSquare } from 'lucide-react'
import { useTranslate } from '@/i18n/use-translate'
import { ShellIcon } from '../../terminal/shells/ShellIcon'
import { useAppStore } from '@/store/index'
import { usePluginNewFiles } from '@/store/plugins/file-creation/plugin-new-files'
import { PluginContributionIcon } from '../../plugins/PluginContributionIcon'
import type { WindowsShellMenuEntry } from './tab-bar-windows-shell-options'
import type { resolveWindowsPowerShellImplementationSetting } from '../model/use-tab-bar-runtime-model'
import type { TabBarProps } from '../tab-bar-props'
import { resolveWindowsShellLaunchTarget } from './windows-shell-launch'
import { TabBarCreateRow } from './TabBarCreateRow'
import { NEW_TAB_MENU_LAYOUT_SETTING } from '../../../../../shared/new-tab-menu/new-tab-menu-layout'
import { CREATE_ROW_TERMINAL_ID, type TabBarCreateRowItem } from './tab-bar-create-row-item'

const ICON_CLASS = 'size-4'

export function TabBarStaticCreateMenu({
  groupId,
  terminalOnly,
  managedBrowserCreationEnabled,
  props,
  windowsShellEntries,
  defaultWindowsPowerShellImplementation,
  pwshAvailable,
  queueNewActiveTerminalFocusAfterNewTabMenuClose
}: {
  props: TabBarProps
  groupId: string
  terminalOnly: boolean
  managedBrowserCreationEnabled: boolean
  windowsShellEntries: WindowsShellMenuEntry[] | undefined
  defaultWindowsPowerShellImplementation: ReturnType<
    typeof resolveWindowsPowerShellImplementationSetting
  >
  pwshAvailable: boolean
  queueNewActiveTerminalFocusAfterNewTabMenuClose: () => void
}): React.ReactNode {
  const t = useTranslate()
  const {
    newTabMenuSurface = 'tab-bar',
    onNewTerminalTab,
    onNewTerminalWithShell,
    onNewBrowserTab,
    onNewFileTab,
    onOpenFileTab
  } = props
  const pluginNewFiles = usePluginNewFiles()

  const terminalItems: TabBarCreateRowItem[] =
    windowsShellEntries && onNewTerminalWithShell
      ? windowsShellEntries.map((entry, index) => ({
          // Why: the first entry is the default shell, which New Terminal's shortcut opens.
          id: index === 0 ? CREATE_ROW_TERMINAL_ID : `${CREATE_ROW_TERMINAL_ID}:${entry.shell}`,
          locked: index === 0,
          label: `${t('auto.components.tab.bar.TabBar.7c1313d237', 'New Terminal:')} ${entry.label}`,
          icon: <ShellIcon shell={entry.shell} size={16} />,
          actionId: index === 0 ? 'tab.newTerminal' : undefined,
          run: () => {
            // Why: menu models shell categories not executables; preserve the user's chosen PowerShell 7+ over inbox powershell.exe.
            queueNewActiveTerminalFocusAfterNewTabMenuClose()
            onNewTerminalWithShell(
              resolveWindowsShellLaunchTarget(
                entry.shell,
                defaultWindowsPowerShellImplementation,
                pwshAvailable
              )
            )
          }
        }))
      : [
          {
            id: CREATE_ROW_TERMINAL_ID,
            locked: true,
            label: t('auto.components.tab.bar.TabBar.d364f3c8d4', 'New Terminal'),
            icon: <TerminalSquare className={ICON_CLASS} />,
            actionId: 'tab.newTerminal',
            run: () => {
              queueNewActiveTerminalFocusAfterNewTabMenuClose()
              onNewTerminalTab()
            }
          }
        ]
  const browserItems: TabBarCreateRowItem[] =
    !terminalOnly && managedBrowserCreationEnabled
      ? [
          {
            id: 'browser',
            label: t('auto.components.tab.bar.TabBar.4833fb2cbe', 'New Browser Tab'),
            icon: <Globe className={ICON_CLASS} />,
            actionId: 'tab.newBrowser',
            run: onNewBrowserTab
          }
        ]
      : []
  const markdownItems: TabBarCreateRowItem[] =
    !terminalOnly && onNewFileTab
      ? [
          {
            id: 'markdown',
            label: t('auto.components.tab.bar.TabBar.3d5d6c960d', 'New Markdown'),
            icon: <FilePlus className={ICON_CLASS} />,
            actionId: 'tab.newMarkdown',
            run: onNewFileTab
          },
          // Plugin file types create files the same way, so they travel with New Markdown.
          ...pluginNewFiles.map((newFile): TabBarCreateRowItem => ({
            id: `plugin-file:${newFile.key}`,
            label: newFile.title,
            detail: newFile.pluginName,
            icon: (
              <PluginContributionIcon
                url={newFile.iconUrl}
                fallback={FilePlus}
                className={ICON_CLASS}
              />
            ),
            run: () => {
              void useAppStore.getState().openNewPluginFileInActiveWorkspace(newFile, groupId)
            }
          }))
        ]
      : []
  const openMarkdownItems: TabBarCreateRowItem[] =
    !terminalOnly && onOpenFileTab
      ? [
          {
            id: 'open-markdown',
            label: t('auto.components.tab.bar.TabBar.4f327c8b3d', 'Open Markdown...'),
            icon: <FileText className={ICON_CLASS} />,
            actionId: 'tab.openMarkdown',
            run: onOpenFileTab
          }
        ]
      : []
  const items =
    newTabMenuSurface === 'floating-panel'
      ? [...markdownItems, ...openMarkdownItems, ...terminalItems, ...browserItems]
      : [...terminalItems, ...browserItems, ...markdownItems, ...openMarkdownItems]

  return (
    <TabBarCreateRow
      items={items}
      customizable={!terminalOnly}
      layoutSetting={NEW_TAB_MENU_LAYOUT_SETTING[newTabMenuSurface]}
    />
  )
}
