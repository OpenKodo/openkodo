import { once } from 'node:events'
import { homedir } from 'node:os'
import { app, ipcMain, shell } from 'electron'
import { spawnDetachedWithoutInheritance } from '@openkodo/process-host/isolated-detached-spawn'
import {
  OPENKODO_UNINSTALL_STEPS,
  type OpenKodoUninstallFinishAction,
  type OpenKodoUninstallPlan,
  type OpenKodoUninstallRunStepArgs
} from '../../shared/uninstall/openkodo-uninstall-types'
import { getClaudeAgentViewService } from '../claude/agent-view/agent-view-service'
import type { Store } from '../persistence/loading-store/store'
import { getLinuxRootPackageType } from '../updater/linux-package/linux-update-package-type'
import {
  findWindowsUninstaller,
  resolveOpenKodoInstallIdentity
} from '../uninstall/openkodo-install-identity'
import {
  buildOpenKodoUninstallPlan,
  runOpenKodoUninstallStep,
  type OpenKodoUninstallHost
} from '../uninstall/openkodo-uninstall-cleanup'
import {
  listOpenKodoUninstallSshHosts,
  removeOpenKodoUninstallSshHostHooks
} from '../uninstall/openkodo-uninstall-ssh-hosts'
import { stopTerminalDaemonsForUninstall } from '../daemon/providers/lifecycle/daemon-uninstall-shutdown'
import { isLocalTerminalDaemonLive } from '../daemon/launch/local-terminal-daemon-stop'
import { readLocalCliInstallStatus, removeLocalCliRegistration } from './cli'

async function createHost(store: Store): Promise<OpenKodoUninstallHost> {
  const userDataPath = app.getPath('userData')
  return {
    platform: process.platform,
    homeDir: homedir(),
    userDataPath,
    uid: process.getuid?.() ?? 0,
    identity: await resolveOpenKodoInstallIdentity({
      platform: process.platform,
      isPackaged: app.isPackaged,
      exePath: app.getPath('exe'),
      homeDir: homedir(),
      env: process.env,
      linuxPackageType: process.platform === 'linux' ? getLinuxRootPackageType() : null
    }),
    disableAgentStatusHooks: async () => {
      await store.updateSettingsAndFlush(
        { agentStatusHooksEnabled: false },
        { notifyListeners: true }
      )
      // Settle the agent-view disable so it can't rewrite the marker after cleanup deletes it.
      await getClaudeAgentViewService().reconcile(store.getSettings())
    },
    getCliStatus: readLocalCliInstallStatus,
    removeCli: removeLocalCliRegistration,
    listHosts: () => listOpenKodoUninstallSshHosts(userDataPath),
    removeHostHooks: (hostId) => removeOpenKodoUninstallSshHostHooks(userDataPath, hostId),
    isTerminalDaemonLive: () => isLocalTerminalDaemonLive(userDataPath),
    stopTerminalDaemon: () => stopTerminalDaemonsForUninstall(userDataPath)
  }
}

async function openWindowsUninstaller(appPath: string | null): Promise<void> {
  const uninstaller =
    process.platform === 'win32' && appPath ? await findWindowsUninstaller(appPath) : null
  if (!appPath || !uninstaller) {
    throw new Error('The OpenKodo uninstaller was not found.')
  }
  const child = spawnDetachedWithoutInheritance({ program: uninstaller, args: [], cwd: appPath })
  child.unref()
  // Quit only once it starts; a refused launch rejects to Settings' error toast.
  await once(child, 'spawn')
}

export function registerOpenKodoUninstallHandlers(store: Store): void {
  // Steps update the plan the renderer last read, so retries keep earlier results.
  let current: OpenKodoUninstallPlan | null = null

  ipcMain.handle('openkodoUninstall:getPlan', async (): Promise<OpenKodoUninstallPlan> => {
    current = await buildOpenKodoUninstallPlan(await createHost(store))
    return current
  })

  ipcMain.handle(
    'openkodoUninstall:runStep',
    async (_event, args: OpenKodoUninstallRunStepArgs): Promise<OpenKodoUninstallPlan> => {
      if (!OPENKODO_UNINSTALL_STEPS.includes(args?.step)) {
        throw new Error(`Unknown uninstall step: ${String(args?.step)}`)
      }
      const only = Array.isArray(args.only)
        ? args.only.filter((id): id is string => typeof id === 'string')
        : undefined
      const host = await createHost(store)
      current = await runOpenKodoUninstallStep(
        current ?? (await buildOpenKodoUninstallPlan(host)),
        args.step,
        host,
        only
      )
      return current
    }
  )

  ipcMain.handle(
    'openkodoUninstall:finish',
    async (_event, action: OpenKodoUninstallFinishAction): Promise<void> => {
      const appPath = current?.appPath ?? (await createHost(store)).identity.appPath
      if (action === 'reveal-app') {
        if (appPath) {
          shell.showItemInFolder(appPath)
        }
        return
      }
      if (action === 'open-windows-uninstaller') {
        await openWindowsUninstaller(appPath)
        app.quit()
        return
      }
      if (action === 'quit') {
        app.quit()
      }
    }
  )
}
