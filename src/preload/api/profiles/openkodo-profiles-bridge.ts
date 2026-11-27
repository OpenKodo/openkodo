import { ipcRenderer } from 'electron'
import type { PreloadApi } from '../../api-types'
import {
  OPENKODO_PROFILE_AUTH_STATUS_CHANGED_CHANNEL,
  OPENKODO_PROFILE_SIGN_IN_PROGRESS_CHANGED_CHANNEL,
  type OpenKodoCloudSignInProgress,
  type OpenKodoProfileListResult,
  type SwitchOpenKodoProfileResult,
  type TransferOpenKodoProfileProjectResult
} from '../../../shared/openkodo-profiles/openkodo-profiles'
import { prepareAndInvokeAppRestart } from '../../renderer/restart/renderer-restart-wiring'
import { awaitBeforeUnloadCheckpoint } from '../../renderer/renderer-runtime'

export const openkodoProfilesApi = {
  list: () => ipcRenderer.invoke('openkodoProfiles:list'),
  authStatus: () => ipcRenderer.invoke('openkodoProfiles:authStatus'),
  onAuthStatusChanged: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on(OPENKODO_PROFILE_AUTH_STATUS_CHANGED_CHANNEL, listener)
    return () => ipcRenderer.removeListener(OPENKODO_PROFILE_AUTH_STATUS_CHANGED_CHANNEL, listener)
  },
  onSignInProgressChanged: (
    callback: (progress: OpenKodoCloudSignInProgress | null) => void
  ): (() => void) => {
    const listener = (_event: unknown, progress: OpenKodoCloudSignInProgress | null): void =>
      callback(progress)
    ipcRenderer.on(OPENKODO_PROFILE_SIGN_IN_PROGRESS_CHANGED_CHANNEL, listener)
    return () =>
      ipcRenderer.removeListener(OPENKODO_PROFILE_SIGN_IN_PROGRESS_CHANGED_CHANNEL, listener)
  },
  createLocal: (args) => ipcRenderer.invoke('openkodoProfiles:createLocal', args),
  createCloudLinked: (args) => ipcRenderer.invoke('openkodoProfiles:createCloudLinked', args),
  switchProfile: (args) =>
    prepareAndInvokeAppRestart(
      window,
      (): Promise<SwitchOpenKodoProfileResult> =>
        ipcRenderer.invoke('openkodoProfiles:switch', args),
      awaitBeforeUnloadCheckpoint,
      (result) => result.status === 'relaunching'
    ),
  transferProject: async (args) => {
    const invoke = (): Promise<TransferOpenKodoProfileProjectResult> =>
      ipcRenderer.invoke('openkodoProfiles:transferProject', args)
    if (args.mode !== 'move') {
      return invoke()
    }
    const current: OpenKodoProfileListResult = await ipcRenderer.invoke('openkodoProfiles:list')
    if (args.sourceProfileId !== current.activeProfileId) {
      return invoke()
    }
    return prepareAndInvokeAppRestart(
      window,
      invoke,
      awaitBeforeUnloadCheckpoint,
      (result) => result.status === 'transferred' && result.willRelaunch === true
    )
  },
  findProjectProfiles: (args) => ipcRenderer.invoke('openkodoProfiles:findProjectProfiles', args),
  connectCurrent: () => ipcRenderer.invoke('openkodoProfiles:connectCurrent'),
  signInProgress: () => ipcRenderer.invoke('openkodoProfiles:signInProgress'),
  cancelSignIn: () => ipcRenderer.invoke('openkodoProfiles:cancelSignIn'),
  refreshAuth: () => ipcRenderer.invoke('openkodoProfiles:refreshAuth'),
  signOutCurrent: () => ipcRenderer.invoke('openkodoProfiles:signOutCurrent'),
  selectOrg: (args) => ipcRenderer.invoke('openkodoProfiles:selectOrg', args),
  orgMembersList: (args) => ipcRenderer.invoke('openkodoProfiles:orgMembersList', args),
  orgMemberInvite: (args) => ipcRenderer.invoke('openkodoProfiles:orgMemberInvite', args),
  orgInviteRevoke: (args) => ipcRenderer.invoke('openkodoProfiles:orgInviteRevoke', args),
  orgMemberChangeRole: (args) => ipcRenderer.invoke('openkodoProfiles:orgMemberChangeRole', args),
  orgMemberRemove: (args) => ipcRenderer.invoke('openkodoProfiles:orgMemberRemove', args),
  openCloudConsole: (args) => ipcRenderer.invoke('openkodoProfiles:openCloudConsole', args)
} satisfies PreloadApi['openkodoProfiles']
