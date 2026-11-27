import { ipcMain } from 'electron'
import type {
  OpenkododManagedConversionResult,
  OpenkododManagedPendingMigrationRow
} from '../../../../shared/remote-runtime/openkodod-lifecycle/openkodod-managed-runtime'
import { listPendingManagedOpenkododMigrations } from '../../../managed-server/lifecycle/openkodod-managed-migration-status'
import { convertSshTargetToManagedOpenkodod } from '../../../managed-server/lifecycle/openkodod-runtime-conversion'
import { conversionCollaborators } from '../../../managed-server/lifecycle/openkodod-runtime-conversion-wiring'
import { requiredString } from './openkodod-runtime-lifecycle-handlers'

export function registerOpenkododRuntimeConversionHandlers(getUserDataPath: () => string): void {
  ipcMain.handle(
    'runtimeEnvironments:convertSshHostToManagedOpenkodod',
    (
      _event,
      args: { sshTargetId: string; name: string }
    ): Promise<OpenkododManagedConversionResult> => {
      return convertSshTargetToManagedOpenkodod(getUserDataPath(), {
        sshTargetId: requiredString(args?.sshTargetId, 'SSH target'),
        name: requiredString(args?.name, 'Server name'),
        ...conversionCollaborators()
      })
    }
  )
  ipcMain.handle(
    'runtimeEnvironments:listPendingOpenkododMigrations',
    (): OpenkododManagedPendingMigrationRow[] =>
      listPendingManagedOpenkododMigrations(getUserDataPath())
  )
}
