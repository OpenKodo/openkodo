import type { StateCreator } from 'zustand'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type {
  OpenKodoCloudSignInProgress,
  OpenKodoProfileAuthStatus,
  OpenKodoProfileSummary,
  SwitchOpenKodoProfileResult,
  TransferOpenKodoProfileProjectArgs,
  TransferOpenKodoProfileProjectResult
} from '../../../../../shared/openkodo-profiles/openkodo-profiles'
import type { AppState } from '../../types'
import {
  createOpenKodoProfilesAuthActions,
  type OpenKodoProfilesAuthActions
} from './openkodo-profiles-auth-actions'

export type OpenKodoProfilesSlice = OpenKodoProfilesAuthActions & {
  openkodoProfiles: OpenKodoProfileSummary[]
  activeOpenKodoProfileId: string | null
  openkodoProfileAuthStatus: OpenKodoProfileAuthStatus | null
  openkodoProfileSignInProgress: OpenKodoCloudSignInProgress | null
  openkodoProfilesMultiProfileUi: boolean
  openkodoProfilesLoading: boolean
  openkodoProfileSwitching: boolean
  fetchOpenKodoProfiles: () => Promise<void>
  fetchOpenKodoProfileAuthStatus: () => Promise<OpenKodoProfileAuthStatus | null>
  createLocalOpenKodoProfile: (name?: string) => Promise<OpenKodoProfileSummary | null>
  switchOpenKodoProfile: (profileId: string) => Promise<SwitchOpenKodoProfileResult | null>
  transferOpenKodoProfileProject: (
    args: TransferOpenKodoProfileProjectArgs
  ) => Promise<TransferOpenKodoProfileProjectResult | null>
}

export const createOpenKodoProfilesSlice: StateCreator<AppState, [], [], OpenKodoProfilesSlice> = (
  set,
  get,
  api
) => ({
  openkodoProfiles: [],
  activeOpenKodoProfileId: null,
  openkodoProfileAuthStatus: null,
  openkodoProfileSignInProgress: null,
  openkodoProfilesMultiProfileUi: false,
  openkodoProfilesLoading: false,
  openkodoProfileSwitching: false,

  fetchOpenKodoProfiles: async () => {
    set({ openkodoProfilesLoading: true })
    try {
      const [state, authStatus] = await Promise.all([
        window.api.openkodoProfiles.list(),
        window.api.openkodoProfiles.authStatus()
      ])
      set({
        activeOpenKodoProfileId: state.activeProfileId,
        openkodoProfiles: state.profiles,
        openkodoProfilesMultiProfileUi: state.multiProfileUi,
        openkodoProfileAuthStatus: authStatus,
        openkodoProfilesLoading: false
      })
    } catch (err) {
      console.error('Failed to fetch OpenKodo profiles:', err)
      set({ openkodoProfilesLoading: false })
    }
  },

  fetchOpenKodoProfileAuthStatus: async () => {
    try {
      const authStatus = await window.api.openkodoProfiles.authStatus()
      set({ openkodoProfileAuthStatus: authStatus })
      return authStatus
    } catch (err) {
      console.error('Failed to fetch OpenKodo profile auth status:', err)
      return null
    }
  },

  createLocalOpenKodoProfile: async (name) => {
    try {
      const state = await window.api.openkodoProfiles.createLocal({ name })
      set({
        activeOpenKodoProfileId: state.activeProfileId,
        openkodoProfiles: state.profiles
      })
      void get().fetchOpenKodoProfileAuthStatus()
      return state.profile
    } catch (err) {
      console.error('Failed to create OpenKodo profile:', err)
      toast.error(
        translate('auto.store.slices.openkodo.profiles.612f7f6861', 'Failed to create profile'),
        {
          description: err instanceof Error ? err.message : String(err)
        }
      )
      return null
    }
  },

  ...createOpenKodoProfilesAuthActions(set, get, api),

  switchOpenKodoProfile: async (profileId) => {
    if (!profileId || profileId === get().activeOpenKodoProfileId) {
      return { status: 'already-active' }
    }
    set({ openkodoProfileSwitching: true })
    try {
      const result = await window.api.openkodoProfiles.switchProfile({ profileId })
      if (result?.status !== 'relaunching') {
        // Only actual relaunch locks switcher; stale already-active answers must unlock it.
        set({ openkodoProfileSwitching: false })
      }
      return result
    } catch (err) {
      console.error('Failed to switch OpenKodo profile:', err)
      set({ openkodoProfileSwitching: false })
      toast.error(
        translate('auto.store.slices.openkodo.profiles.7d4bc516ee', 'Failed to switch profile'),
        {
          description: err instanceof Error ? err.message : String(err)
        }
      )
      return null
    }
  },

  transferOpenKodoProfileProject: async (args) => {
    try {
      const result = await window.api.openkodoProfiles.transferProject(args)
      if (result.status === 'duplicate-target') {
        toast.error(
          translate(
            'auto.store.slices.openkodo.profiles.f518e89aa5',
            'Project already exists in that profile'
          )
        )
      }
      if (result.status === 'transferred' && result.willRelaunch) {
        set({ openkodoProfileSwitching: true })
      }
      return result
    } catch (err) {
      console.error('Failed to transfer OpenKodo profile project:', err)
      toast.error(
        translate('auto.store.slices.openkodo.profiles.f03ae7f27b', 'Failed to transfer project'),
        {
          description: err instanceof Error ? err.message : String(err)
        }
      )
      return null
    }
  }
})
