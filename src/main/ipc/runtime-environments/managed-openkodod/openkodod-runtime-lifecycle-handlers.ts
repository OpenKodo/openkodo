import { ipcMain } from 'electron'
import type { OpenkododManagedRuntimeStatus } from '../../../../shared/remote-runtime/openkodod-lifecycle/openkodod-managed-runtime'
import { createManagedOpenkododEnvironment } from '../../../managed-server/lifecycle/openkodod-runtime-deployment'
import { getManagedOpenkododRuntimeStatus } from '../../../managed-server/lifecycle/openkodod-runtime-status'

export function registerOpenkododRuntimeLifecycleHandlers(options: {
  getUserDataPath: () => string
}): void {
  ipcMain.handle(
    'runtimeEnvironments:deployOpenkodod',
    async (_event, args: { name: string; sshTargetId: string; force?: boolean }) =>
      createManagedOpenkododEnvironment(options.getUserDataPath(), {
        name: requiredString(args?.name, 'Server name'),
        sshTargetId: requiredString(args?.sshTargetId, 'SSH target'),
        force: args?.force === true
      })
  )
  ipcMain.handle(
    'runtimeEnvironments:getOpenkododStatus',
    (_event, args: { selector: string }): Promise<OpenkododManagedRuntimeStatus> =>
      getManagedOpenkododRuntimeStatus(
        options.getUserDataPath(),
        requiredString(args?.selector, 'Server')
      )
  )
}

export function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required.`)
  }
  return value.trim()
}
