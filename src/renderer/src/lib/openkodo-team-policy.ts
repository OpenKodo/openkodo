import { useAppStore } from '@/store'
import {
  isOpenKodoCloudTeamFeatureBlocked,
  type OpenKodoCloudTeamFeatureFlag
} from '../../../shared/openkodo-profiles/openkodo-cloud-team-policy'

export function useOpenKodoTeamFeatureBlocked(flag: OpenKodoCloudTeamFeatureFlag): boolean {
  return useAppStore((state) =>
    isOpenKodoCloudTeamFeatureBlocked(state.openkodoProfileAuthStatus, flag)
  )
}
