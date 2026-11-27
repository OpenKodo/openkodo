/** Managed openkodod servers over SSH; desktop-only, so web clients leave it undefined. */
import { ipcRenderer } from 'electron'
import type {
  OpenkododDeltaMovePreview,
  OpenkododDeltaMoveResult,
  OpenkododManagedCancelStopResult,
  OpenkododManagedConversionResult,
  OpenkododManagedDeployResult,
  OpenkododManagedForgetResult,
  OpenkododManagedPastLiveTerminals,
  OpenkododManagedPendingMigrationRow,
  OpenkododManagedRecoveryResult,
  OpenkododManagedRestartResult,
  OpenkododManagedStaleLockReclaimRequest,
  OpenkododManagedStaleLockReclaimResult,
  OpenkododManagedRollbackResult,
  OpenkododManagedRuntimeStatus,
  OpenkododManagedStopResult
} from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-managed-runtime'
import type { PublicKnownRuntimeEnvironment } from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import type {
  RuntimeSshAccessLinkRequest,
  RuntimeSshAccessUnlinkRequest
} from '../../../shared/remote-runtime/host-catalog/runtime-ssh-access'

export type ManagedOpenkododPreloadApi = {
  deploy: (args: {
    name: string
    sshTargetId: string
    force?: boolean
  }) => Promise<OpenkododManagedDeployResult>
  getStatus: (args: { selector: string }) => Promise<OpenkododManagedRuntimeStatus>
  update: (args: {
    selector: string
    force?: boolean
    pastLiveTerminals?: OpenkododManagedPastLiveTerminals
  }) => Promise<OpenkododManagedDeployResult>
  rollback: (args: { selector: string }) => Promise<OpenkododManagedRollbackResult>
  recover: (args: {
    selector: string
    /** Restore the snapshot over state a rejected build changed; see OPENKODOD_RECOVERY_CHANGED_STATE_CODE. */
    acceptChangedState?: boolean
  }) => Promise<OpenkododManagedRecoveryResult>
  /** Restarts from this client's SSH session; refused while terminals run. */
  restart: (args: { selector: string }) => Promise<OpenkododManagedRestartResult>
  /** Without `yes`, only reports whether the host's instance lock may be cleared. */
  reclaimStaleLock: (
    args: { selector: string } & OpenkododManagedStaleLockReclaimRequest
  ) => Promise<OpenkododManagedStaleLockReclaimResult>
  stop: (args: { selector: string }) => Promise<OpenkododManagedStopResult>
  cancelStop: (args: { selector: string }) => Promise<OpenkododManagedCancelStopResult>
  forget: (args: { selector: string }) => Promise<OpenkododManagedForgetResult>
  linkSshAccess: (args: RuntimeSshAccessLinkRequest) => Promise<PublicKnownRuntimeEnvironment>
  unlinkSshAccess: (args: RuntimeSshAccessUnlinkRequest) => Promise<PublicKnownRuntimeEnvironment>
  convertSshHost: (args: {
    sshTargetId: string
    name: string
  }) => Promise<OpenkododManagedConversionResult>
  listPendingMigrations: () => Promise<OpenkododManagedPendingMigrationRow[]>
  previewDeltaMove: (args: { sshTargetId: string }) => Promise<OpenkododDeltaMovePreview>
  moveDelta: (args: { sshTargetId: string }) => Promise<OpenkododDeltaMoveResult>
  keepServerVersion: (args: { sshTargetId: string }) => Promise<void>
  /** "Move anyway": the next connect leaves what can't move on this desktop. */
  allowMoveLeavingBehind: (args: { sshTargetId: string }) => Promise<void>
}

export const managedOpenkododApi: ManagedOpenkododPreloadApi = {
  deploy: (args) => ipcRenderer.invoke('runtimeEnvironments:deployOpenkodod', args),
  getStatus: (args) => ipcRenderer.invoke('runtimeEnvironments:getOpenkododStatus', args),
  update: (args) => ipcRenderer.invoke('runtimeEnvironments:updateOpenkodod', args),
  rollback: (args) => ipcRenderer.invoke('runtimeEnvironments:rollbackOpenkodod', args),
  recover: (args) => ipcRenderer.invoke('runtimeEnvironments:recoverOpenkodod', args),
  restart: (args) => ipcRenderer.invoke('runtimeEnvironments:restartOpenkodod', args),
  reclaimStaleLock: (args) =>
    ipcRenderer.invoke('runtimeEnvironments:reclaimOpenkododStaleLock', args),
  stop: (args) => ipcRenderer.invoke('runtimeEnvironments:stopOpenkodod', args),
  cancelStop: (args) => ipcRenderer.invoke('runtimeEnvironments:cancelOpenkododStop', args),
  forget: (args) => ipcRenderer.invoke('runtimeEnvironments:forgetOpenkodod', args),
  linkSshAccess: (args) => ipcRenderer.invoke('runtimeEnvironments:linkSshAccess', args),
  unlinkSshAccess: (args) => ipcRenderer.invoke('runtimeEnvironments:unlinkSshAccess', args),
  convertSshHost: (args) =>
    ipcRenderer.invoke('runtimeEnvironments:convertSshHostToManagedOpenkodod', args),
  listPendingMigrations: () =>
    ipcRenderer.invoke('runtimeEnvironments:listPendingOpenkododMigrations'),
  previewDeltaMove: (args) =>
    ipcRenderer.invoke('runtimeEnvironments:previewOpenkododDeltaMove', args),
  moveDelta: (args) => ipcRenderer.invoke('runtimeEnvironments:moveOpenkododDelta', args),
  keepServerVersion: (args) =>
    ipcRenderer.invoke('runtimeEnvironments:keepOpenkododServerVersion', args),
  allowMoveLeavingBehind: (args) =>
    ipcRenderer.invoke('runtimeEnvironments:allowOpenkododMoveLeavingBehind', args)
}
