import { ipcMain } from 'electron'
import { registerManagedServerActions } from '../../../runtime/hosts/management/managed-server-actions-registry'
import {
  createManagedOpenkododActions,
  reclaimManagedOpenkododStaleLock,
  restartManagedOpenkodod,
  type ManagedOpenkododActionOptions
} from './managed-openkodod-actions'
import { requiredString } from './openkodod-runtime-lifecycle-handlers'

export function registerOpenkododRuntimeMaintenanceHandlers(
  options: ManagedOpenkododActionOptions
): void {
  const actions = createManagedOpenkododActions(options)
  // CLI runtime RPC uses these same managedServer actions.
  registerManagedServerActions(actions)
  ipcMain.handle(
    'runtimeEnvironments:updateOpenkodod',
    async (
      _event,
      args: {
        selector: string
        force?: boolean
        pastLiveTerminals?: { incumbentVersion?: unknown; uncounted?: unknown }
      }
    ) => {
      const incumbentVersion = args?.pastLiveTerminals?.incumbentVersion
      const pastLiveTerminals =
        args?.pastLiveTerminals &&
        (typeof incumbentVersion === 'string' || incumbentVersion === null)
          ? {
              incumbentVersion,
              ...(args.pastLiveTerminals.uncounted === true ? { uncounted: true as const } : {})
            }
          : undefined
      return actions.update(
        requiredString(args?.selector, 'Server'),
        args?.force === true,
        pastLiveTerminals
      )
    }
  )
  ipcMain.handle(
    'runtimeEnvironments:rollbackOpenkodod',
    async (_event, args: { selector: string }) =>
      actions.rollback(requiredString(args?.selector, 'Server'))
  )
  ipcMain.handle(
    'runtimeEnvironments:recoverOpenkodod',
    async (_event, args: { selector: string; acceptChangedState?: boolean }) =>
      actions.recover(requiredString(args?.selector, 'Server'), args?.acceptChangedState === true)
  )
  ipcMain.handle(
    'runtimeEnvironments:restartOpenkodod',
    async (_event, args: { selector: string }) =>
      restartManagedOpenkodod(options, requiredString(args?.selector, 'Server'))
  )
  ipcMain.handle(
    'runtimeEnvironments:reclaimOpenkododStaleLock',
    async (_event, args: { selector: string; yes?: boolean; expectNonce?: string }) =>
      reclaimManagedOpenkododStaleLock(
        options,
        requiredString(args?.selector, 'Server'),
        // A confirmation without the checked record's nonce could clear a lock written since.
        args?.yes === true
          ? { yes: true, expectNonce: requiredString(args.expectNonce, 'The checked lock') }
          : { yes: false }
      )
  )
  ipcMain.handle('runtimeEnvironments:stopOpenkodod', async (_event, args: { selector: string }) =>
    actions.stop(requiredString(args?.selector, 'Server'))
  )
  ipcMain.handle(
    'runtimeEnvironments:cancelOpenkododStop',
    async (_event, args: { selector: string }) =>
      actions.cancelStop(requiredString(args?.selector, 'Server'))
  )
  ipcMain.handle(
    'runtimeEnvironments:forgetOpenkodod',
    async (_event, args: { selector: string }) =>
      actions.forget(requiredString(args?.selector, 'Server'))
  )
}
