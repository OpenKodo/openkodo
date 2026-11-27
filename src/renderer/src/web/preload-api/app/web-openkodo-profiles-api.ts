import type { PreloadApi } from '../../../../../preload/api-types'
import {
  DEFAULT_LOCAL_OPENKODO_PROFILE_ID,
  createDefaultLocalOpenKodoProfile
} from '../../../../../shared/openkodo-profiles/openkodo-profiles'
import { noopUnsubscribe } from '../web-storage'

export function createWebOpenKodoProfilesApi(): Partial<PreloadApi> {
  const webOpenKodoProfileAuthStatus = () =>
    Promise.resolve({
      activeProfileId: DEFAULT_LOCAL_OPENKODO_PROFILE_ID,
      configured: false,
      state: 'unconfigured' as const,
      persistence: 'none' as const,
      setupMessage: 'cloud service sign-in is not available in the browser fallback.'
    })
  return {
    openkodoProfiles: {
      list: () =>
        Promise.resolve({
          activeProfileId: DEFAULT_LOCAL_OPENKODO_PROFILE_ID,
          profiles: [createDefaultLocalOpenKodoProfile(0)],
          multiProfileUi: false
        }),
      authStatus: webOpenKodoProfileAuthStatus,
      onAuthStatusChanged: () => noopUnsubscribe,
      onSignInProgressChanged: () => noopUnsubscribe,
      createLocal: () =>
        Promise.resolve({
          activeProfileId: DEFAULT_LOCAL_OPENKODO_PROFILE_ID,
          profiles: [createDefaultLocalOpenKodoProfile(0)],
          profile: createDefaultLocalOpenKodoProfile(0)
        }),
      createCloudLinked: async () => ({
        status: 'unconfigured',
        auth: await webOpenKodoProfileAuthStatus()
      }),
      switchProfile: () => Promise.resolve({ status: 'already-active' }),
      transferProject: (args) =>
        Promise.resolve({
          status: 'duplicate-target',
          sourceProfileId: args.sourceProfileId,
          targetProfileId: args.targetProfileId,
          sourceRepoId: args.repoId,
          duplicateRepoId: args.repoId
        }),
      findProjectProfiles: async () => ({ projects: [] }),
      connectCurrent: async () => ({
        status: 'unconfigured',
        auth: await webOpenKodoProfileAuthStatus()
      }),
      signInProgress: async () => null,
      cancelSignIn: async () => {},
      refreshAuth: async () => ({
        status: 'unconfigured',
        auth: await webOpenKodoProfileAuthStatus()
      }),
      signOutCurrent: async () => ({
        status: 'signed-out',
        auth: await webOpenKodoProfileAuthStatus(),
        activeProfileId: DEFAULT_LOCAL_OPENKODO_PROFILE_ID,
        profiles: [createDefaultLocalOpenKodoProfile(0)]
      }),
      selectOrg: async () => ({
        status: 'unconfigured',
        auth: await webOpenKodoProfileAuthStatus()
      }),
      orgMembersList: async () => ({ status: 'unconfigured' }),
      orgMemberInvite: async () => ({ status: 'unconfigured' }),
      orgInviteRevoke: async () => ({ status: 'unconfigured' }),
      orgMemberChangeRole: async () => ({ status: 'unconfigured' }),
      orgMemberRemove: async () => ({ status: 'unconfigured' }),
      openCloudConsole: async () => ({ status: 'unconfigured' })
    }
  }
}
