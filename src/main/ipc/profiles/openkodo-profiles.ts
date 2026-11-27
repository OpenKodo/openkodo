import { ipcMain, type WebContents } from 'electron'
import type { Store } from '../../persistence/loading-store/store'
import { relaunchApp, type AppRelaunchReason } from '../../startup/quit/app-relaunch'
import { quitProcess } from '../../startup/quit/process-quit-request'
import type {
  CreateLocalOpenKodoProfileArgs,
  CreateLocalOpenKodoProfileResult,
  CreateCloudLinkedOpenKodoProfileArgs,
  CreateCloudLinkedOpenKodoProfileResult,
  FindOpenKodoProfileProjectsByPathArgs,
  FindOpenKodoProfileProjectsByPathResult,
  OpenKodoProfileListResult,
  RefreshCurrentOpenKodoProfileAuthResult,
  SwitchOpenKodoProfileArgs,
  SwitchOpenKodoProfileResult,
  TransferOpenKodoProfileProjectArgs,
  TransferOpenKodoProfileProjectResult,
  ConnectCurrentOpenKodoProfileResult,
  OpenKodoProfileAuthStatus,
  OpenKodoCloudSignInProgress,
  SelectOpenKodoProfileOrgArgs,
  SelectOpenKodoProfileOrgResult,
  SignOutCurrentOpenKodoProfileResult
} from '../../../shared/openkodo-profiles/openkodo-profiles'
import {
  createLocalOpenKodoProfile,
  getOpenKodoProfileListState,
  setActiveOpenKodoProfile
} from '../../openkodo-profiles/profile-index-store'
import { initializeNewOpenKodoProfileState } from '../../openkodo-profiles/storage/new-profile-state'
import { getProfileUserDataPath } from '../../openkodo-profiles/profile-storage-paths'
import { isMultiProfileUiEnabled } from '../../openkodo-profiles/profile-ui-scope'
import { transferOpenKodoProfileProject } from '../../openkodo-profiles/project-transfer/profile-project-transfer'
import { transferActiveProfileProject } from '../../openkodo-profiles/project-transfer/profile-active-transfer'
import { findOpenKodoProfileProjectsByPath } from '../../openkodo-profiles/catalog/profile-project-presence'
import {
  flushActiveProfileBeforeFileMutation,
  flushActiveProfileBeforeRelaunch
} from '../../openkodo-profiles/storage/profile-persistence-deadline'
import { normalizeExecutionHostId } from '../../../shared/execution-host/execution-host'
import type { OpenKodoAccountService } from '../../openkodo-profiles/openkodo-account-service'
import { registerOpenKodoProfileOrgMemberHandlers } from './openkodo-profile-org-members-handlers'
import {
  isOpenKodoCloudConsoleSection,
  type OpenKodoCloudConsoleOpenResult
} from '../../../shared/openkodo-cloud-console'
import { onOpenKodoCloudSessionInvalidated } from '../../openkodo-profiles/cloud-session/profile-cloud-session-invalidation'
import {
  broadcastOpenKodoProfileAuthStatusChanged,
  broadcastOpenKodoProfileSignInProgressChanged,
  broadcastTeamPolicyChanges
} from './openkodo-profile-auth-status-broadcast'
import {
  cancelOpenKodoCloudSignIn,
  getOpenKodoCloudSignInProgress,
  onOpenKodoCloudSignInProgressChanged
} from '../../openkodo-profiles/cloud-auth/profile-cloud-sign-in-progress'
import { profileIdFromArgs } from './openkodo-profile-id-arg'
import { transferProjectArgsFromUnknown } from './openkodo-profile-project-transfer-args'

type RegisterOpenKodoProfileHandlersOptions = {
  onBeforeRelaunch?: () => void | Promise<void>
}

function findProjectsByPathArgsFromUnknown(args: unknown): FindOpenKodoProfileProjectsByPathArgs {
  if (!args || typeof args !== 'object') {
    throw new Error('invalid_openkodo_profile_project_path')
  }
  const candidate = args as FindOpenKodoProfileProjectsByPathArgs
  const path = typeof candidate.path === 'string' ? candidate.path.trim() : ''
  if (!path) {
    throw new Error('invalid_openkodo_profile_project_path')
  }
  let executionHostId: FindOpenKodoProfileProjectsByPathArgs['executionHostId'] = null
  if (candidate.executionHostId !== null && candidate.executionHostId !== undefined) {
    if (typeof candidate.executionHostId !== 'string') {
      throw new Error('invalid_openkodo_profile_project_path')
    }
    executionHostId = normalizeExecutionHostId(candidate.executionHostId)
    if (!executionHostId) {
      throw new Error('invalid_openkodo_profile_project_path')
    }
  }
  return {
    path,
    connectionId:
      typeof candidate.connectionId === 'string' ? candidate.connectionId.trim() || null : null,
    executionHostId,
    excludeProfileId:
      typeof candidate.excludeProfileId === 'string'
        ? candidate.excludeProfileId.trim() || null
        : null
  }
}

function orgIdFromUnknown(args: unknown): string {
  if (!args || typeof args !== 'object') {
    throw new Error('invalid_openkodo_profile_org_selection')
  }
  const orgId = (args as SelectOpenKodoProfileOrgArgs).orgId?.trim()
  if (!orgId) {
    throw new Error('invalid_openkodo_profile_org_selection')
  }
  return orgId
}

function createCloudLinkedProfileArgsFromUnknown(
  args: unknown
): CreateCloudLinkedOpenKodoProfileArgs {
  if (!args || typeof args !== 'object') {
    return {}
  }
  const candidate = args as CreateCloudLinkedOpenKodoProfileArgs
  const orgId = typeof candidate.orgId === 'string' ? candidate.orgId.trim() : undefined
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : undefined
  return {
    ...(orgId ? { orgId } : {}),
    ...(name ? { name } : {})
  }
}

async function runBeforeProfileRelaunch(
  onBeforeRelaunch?: () => void | Promise<void>
): Promise<void> {
  try {
    await onBeforeRelaunch?.()
  } catch (error) {
    console.warn(
      '[openkodo-profiles] Pre-relaunch cleanup failed; continuing profile switch:',
      error instanceof Error ? error.name : typeof error
    )
  }
}

type ProfileRelaunchReason = Extract<AppRelaunchReason, `profile-${string}`>

function scheduleProfileRelaunch(reason: ProfileRelaunchReason, sender: WebContents): void {
  if (!sender.isDestroyed()) {
    sender.send('app:restart-committed')
  }
  setTimeout(() => {
    relaunchApp(reason)
    // Normal quit preserves renderer scrollback, PTY teardown, stats flush and final daemon checkpoints.
    quitProcess()
  }, 150)
}

export function registerOpenKodoProfileHandlers(
  store: Store,
  openkodoAccount: OpenKodoAccountService,
  options: RegisterOpenKodoProfileHandlersOptions = {}
): void {
  ipcMain.handle('openkodoProfiles:list', (): OpenKodoProfileListResult => ({
    ...getOpenKodoProfileListState(),
    multiProfileUi: isMultiProfileUiEnabled()
  }))

  ipcMain.handle('openkodoProfiles:authStatus', (): OpenKodoProfileAuthStatus =>
    openkodoAccount.getAuthStatus()
  )

  // Push background invalidation; re-entering onAuthMutation would loop into the relay coordinator that just failed.
  onOpenKodoCloudSessionInvalidated(broadcastOpenKodoProfileAuthStatusChanged)
  broadcastTeamPolicyChanges()
  onOpenKodoCloudSignInProgressChanged(broadcastOpenKodoProfileSignInProgressChanged)

  ipcMain.handle(
    'openkodoProfiles:createLocal',
    (_event, args?: CreateLocalOpenKodoProfileArgs): CreateLocalOpenKodoProfileResult => {
      const result = createLocalOpenKodoProfile(args)
      initializeNewOpenKodoProfileState(result.profile.id, store.getSettings().telemetry)
      return result
    }
  )

  ipcMain.handle(
    'openkodoProfiles:switch',
    async (event, args: SwitchOpenKodoProfileArgs): Promise<SwitchOpenKodoProfileResult> => {
      const profileId = profileIdFromArgs(args)
      const current = getOpenKodoProfileListState()
      if (profileId === current.activeProfileId) {
        return { status: 'already-active' }
      }

      // Flush the source profile before switching the startup index; keep its writer alive through relaunch cleanup.
      await flushActiveProfileBeforeRelaunch(store)
      setActiveOpenKodoProfile(profileId)
      await runBeforeProfileRelaunch(options.onBeforeRelaunch)

      scheduleProfileRelaunch('profile-switch', event.sender)

      return { status: 'relaunching' }
    }
  )

  ipcMain.handle(
    'openkodoProfiles:transferProject',
    async (
      event,
      rawArgs: TransferOpenKodoProfileProjectArgs
    ): Promise<TransferOpenKodoProfileProjectResult> => {
      const args = transferProjectArgsFromUnknown(rawArgs)
      const current = getOpenKodoProfileListState()
      if (args.targetProfileId === current.activeProfileId) {
        throw new Error('active_target_openkodo_profile_transfer_requires_relaunch')
      }
      if (args.mode === 'move' && args.sourceProfileId === current.activeProfileId) {
        // Finish transfer before relaunch side effects so validation failure cannot strand the app quitting.
        const result = await transferActiveProfileProject(
          args,
          getProfileUserDataPath(),
          store,
          async () => {
            await runBeforeProfileRelaunch(options.onBeforeRelaunch)
            scheduleProfileRelaunch('profile-transfer', event.sender)
          }
        )
        if (result.status === 'transferred') {
          await runBeforeProfileRelaunch(options.onBeforeRelaunch)
          try {
            setActiveOpenKodoProfile(args.targetProfileId)
          } finally {
            // The source has already changed and its writer cannot resume.
            scheduleProfileRelaunch('profile-transfer', event.sender)
          }
          return { ...result, willRelaunch: true }
        }
        return result
      }
      if (args.sourceProfileId !== current.activeProfileId) {
        await store.flushPendingOrThrowAsync({ drainToStableGeneration: false })
        return transferOpenKodoProfileProject(args, getProfileUserDataPath())
      }
      const maintenance = await flushActiveProfileBeforeFileMutation(store)
      try {
        return transferOpenKodoProfileProject(args, getProfileUserDataPath())
      } finally {
        await maintenance.resume()
      }
    }
  )

  ipcMain.handle(
    'openkodoProfiles:findProjectProfiles',
    (
      _event,
      rawArgs: FindOpenKodoProfileProjectsByPathArgs
    ): FindOpenKodoProfileProjectsByPathResult =>
      findOpenKodoProfileProjectsByPath(
        findProjectsByPathArgsFromUnknown(rawArgs),
        getProfileUserDataPath()
      )
  )

  ipcMain.handle(
    'openkodoProfiles:connectCurrent',
    (): Promise<ConnectCurrentOpenKodoProfileResult> => openkodoAccount.connect()
  )

  ipcMain.handle('openkodoProfiles:signInProgress', (): OpenKodoCloudSignInProgress | null =>
    getOpenKodoCloudSignInProgress()
  )

  ipcMain.handle('openkodoProfiles:cancelSignIn', (): void => cancelOpenKodoCloudSignIn())

  ipcMain.handle(
    'openkodoProfiles:createCloudLinked',
    async (
      _event,
      rawArgs?: CreateCloudLinkedOpenKodoProfileArgs
    ): Promise<CreateCloudLinkedOpenKodoProfileResult> =>
      openkodoAccount.createCloudLinked(
        createCloudLinkedProfileArgsFromUnknown(rawArgs),
        (profileId) => initializeNewOpenKodoProfileState(profileId, store.getSettings().telemetry)
      )
  )

  ipcMain.handle(
    'openkodoProfiles:refreshAuth',
    (): Promise<RefreshCurrentOpenKodoProfileAuthResult> => openkodoAccount.refreshAuth()
  )

  ipcMain.handle(
    'openkodoProfiles:signOutCurrent',
    (): Promise<SignOutCurrentOpenKodoProfileResult> => openkodoAccount.signOut()
  )

  ipcMain.handle(
    'openkodoProfiles:selectOrg',
    async (
      _event,
      rawArgs: SelectOpenKodoProfileOrgArgs
    ): Promise<SelectOpenKodoProfileOrgResult> =>
      openkodoAccount.selectOrg(orgIdFromUnknown(rawArgs))
  )

  ipcMain.handle(
    'openkodoProfiles:openCloudConsole',
    async (_event, rawArgs: unknown): Promise<OpenKodoCloudConsoleOpenResult> => {
      const section =
        typeof rawArgs === 'object' && rawArgs !== null && 'section' in rawArgs
          ? rawArgs.section
          : undefined
      if (!isOpenKodoCloudConsoleSection(section)) {
        return { status: 'failed', error: 'invalid_openkodo_cloud_console_section' }
      }
      return openkodoAccount.openConsole(section)
    }
  )

  registerOpenKodoProfileOrgMemberHandlers()
}
