import type { StateCreator } from 'zustand'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type {
  ConnectCurrentOpenKodoProfileResult,
  CreateCloudLinkedOpenKodoProfileResult,
  RefreshCurrentOpenKodoProfileAuthResult,
  SelectOpenKodoProfileOrgResult,
  SignOutCurrentOpenKodoProfileResult
} from '../../../../../shared/openkodo-profiles/openkodo-profiles'
import type { AppState } from '../../types'

export type OpenKodoProfilesAuthActions = {
  createCloudLinkedOpenKodoProfile: (args: {
    orgId?: string
    name?: string
  }) => Promise<CreateCloudLinkedOpenKodoProfileResult | null>
  connectCurrentOpenKodoProfile: () => Promise<ConnectCurrentOpenKodoProfileResult | null>
  refreshCurrentOpenKodoProfileAuth: () => Promise<RefreshCurrentOpenKodoProfileAuthResult | null>
  signOutCurrentOpenKodoProfile: () => Promise<SignOutCurrentOpenKodoProfileResult | null>
  selectOpenKodoProfileOrg: (orgId: string) => Promise<SelectOpenKodoProfileOrgResult | null>
}

export const createOpenKodoProfilesAuthActions: StateCreator<
  AppState,
  [],
  [],
  OpenKodoProfilesAuthActions
> = (set, get) => {
  let nextConnectAttempt = 0
  let appliedConnectAttempt = 0

  return {
    createCloudLinkedOpenKodoProfile: async (args) => {
      try {
        const result = await window.api.openkodoProfiles.createCloudLinked(args)
        set({
          openkodoProfileAuthStatus: result.auth,
          ...(result.status === 'created'
            ? {
                activeOpenKodoProfileId: result.activeProfileId,
                openkodoProfiles: result.profiles
              }
            : {})
        })
        if (result.status === 'created') {
          toast.success(
            translate('auto.store.slices.openkodo.profiles.319d7cf39b', 'Cloud profile created')
          )
        } else if (result.status === 'reconnect-required') {
          toast.error(
            translate('auto.store.slices.openkodo.profiles.d6e764e7db', 'Reconnect this profile')
          )
        } else if (result.status === 'failed') {
          toast.error(
            translate(
              'auto.store.slices.openkodo.profiles.f0c9e11a6d',
              'Failed to create cloud profile'
            ),
            { description: result.error }
          )
        }
        return result
      } catch (err) {
        console.error('Failed to create OpenKodo cloud profile:', err)
        toast.error(
          translate(
            'auto.store.slices.openkodo.profiles.f0c9e11a6d',
            'Failed to create cloud profile'
          ),
          {
            description: err instanceof Error ? err.message : String(err)
          }
        )
        return null
      }
    },

    connectCurrentOpenKodoProfile: async () => {
      const attempt = ++nextConnectAttempt
      try {
        // Pending PKCE must not block retry; newer linked waits supersede older callbacks.
        const result = await window.api.openkodoProfiles.connectCurrent()
        if (attempt < appliedConnectAttempt) {
          return result
        }
        const alreadyConnected = get().openkodoProfileAuthStatus?.state === 'connected'
        set({
          openkodoProfileAuthStatus: result.auth,
          ...(result.status === 'connected'
            ? {
                activeOpenKodoProfileId: result.activeProfileId,
                openkodoProfiles: result.profiles
              }
            : {})
        })
        if (result.status === 'connected') {
          appliedConnectAttempt = attempt
          if (!alreadyConnected) {
            toast.success(
              translate('auto.store.slices.openkodo.profiles.9fcb07a796', 'Profile connected')
            )
          }
        } else if (result.status === 'unconfigured') {
          toast.error(
            translate(
              'auto.store.slices.openkodo.profiles.8b8fa73174',
              'cloud service sign-in is not configured'
            ),
            {
              description: result.auth.setupMessage
            }
          )
        } else if (result.status === 'timed-out' && !alreadyConnected) {
          toast.error(
            translate('auto.store.slices.openkodo.profiles.signInTimedOut', 'Sign-in timed out')
          )
        } else if (
          result.status === 'failed' &&
          !alreadyConnected &&
          result.auth.state !== 'connected'
        ) {
          toast.error(
            translate(
              'auto.store.slices.openkodo.profiles.33290e88ed',
              'Failed to connect profile'
            ),
            { description: result.error }
          )
        }
        return result
      } catch (err) {
        console.error('Failed to connect OpenKodo profile:', err)
        if (
          attempt >= appliedConnectAttempt &&
          get().openkodoProfileAuthStatus?.state !== 'connected'
        ) {
          toast.error(
            translate(
              'auto.store.slices.openkodo.profiles.33290e88ed',
              'Failed to connect profile'
            ),
            {
              description: err instanceof Error ? err.message : String(err)
            }
          )
        }
        return null
      }
    },

    refreshCurrentOpenKodoProfileAuth: async () => {
      try {
        const result = await window.api.openkodoProfiles.refreshAuth()
        set({
          openkodoProfileAuthStatus: result.auth,
          ...(result.status === 'refreshed'
            ? {
                activeOpenKodoProfileId: result.activeProfileId,
                openkodoProfiles: result.profiles
              }
            : {})
        })
        if (result.status === 'reconnect-required') {
          toast.error(
            translate('auto.store.slices.openkodo.profiles.d6e764e7db', 'Reconnect this profile')
          )
        } else if (result.status === 'failed') {
          toast.error(
            translate(
              'auto.store.slices.openkodo.profiles.2f6c78a039',
              'Failed to refresh profile auth'
            ),
            { description: result.error }
          )
        }
        return result
      } catch (err) {
        console.error('Failed to refresh OpenKodo profile auth:', err)
        toast.error(
          translate(
            'auto.store.slices.openkodo.profiles.2f6c78a039',
            'Failed to refresh profile auth'
          ),
          {
            description: err instanceof Error ? err.message : String(err)
          }
        )
        return null
      }
    },

    signOutCurrentOpenKodoProfile: async () => {
      nextConnectAttempt += 1
      appliedConnectAttempt = nextConnectAttempt
      try {
        const result = await window.api.openkodoProfiles.signOutCurrent()
        set({
          activeOpenKodoProfileId: result.activeProfileId,
          openkodoProfiles: result.profiles,
          openkodoProfileAuthStatus: result.auth
        })
        if (result.auth.state !== 'connected') {
          toast.success(
            translate('auto.store.slices.openkodo.profiles.a37b5e6d37', 'Signed out of OpenKodo')
          )
        }
        return result
      } catch (err) {
        console.error('Failed to sign out of OpenKodo profile:', err)
        toast.error(
          translate('auto.store.slices.openkodo.profiles.83600521e7', 'Failed to sign out'),
          {
            description: err instanceof Error ? err.message : String(err)
          }
        )
        return null
      }
    },

    selectOpenKodoProfileOrg: async (orgId) => {
      try {
        const result = await window.api.openkodoProfiles.selectOrg({ orgId })
        set({
          openkodoProfileAuthStatus: result.auth,
          ...(result.status === 'selected'
            ? {
                activeOpenKodoProfileId: result.activeProfileId,
                openkodoProfiles: result.profiles
              }
            : {})
        })
        if (result.status === 'reconnect-required') {
          toast.error(
            translate('auto.store.slices.openkodo.profiles.d6e764e7db', 'Reconnect this profile')
          )
        } else if (result.status === 'failed') {
          toast.error(
            translate(
              'auto.store.slices.openkodo.profiles.76deec8f58',
              'Failed to switch organization'
            ),
            { description: result.error }
          )
        }
        return result
      } catch (err) {
        console.error('Failed to switch OpenKodo profile org:', err)
        toast.error(
          translate(
            'auto.store.slices.openkodo.profiles.76deec8f58',
            'Failed to switch organization'
          ),
          {
            description: err instanceof Error ? err.message : String(err)
          }
        )
        return null
      }
    }
  }
}
