import type { OpenKodoCloudAuthConfig } from '../cloud-auth/profile-cloud-auth-config'
import {
  OpenKodoCloudRequestError,
  selectOpenKodoCloudOrg
} from '../cloud-auth/profile-cloud-client'
import { forceRefreshOpenKodoCloudSession } from '../cloud-session/profile-cloud-session-refresh'
import type { ActiveOpenKodoProfileState } from '../profile-index-store'
import type { OpenKodoProfileListState } from '../../../shared/openkodo-profiles/openkodo-profiles'
import {
  beginCloudSessionRelink,
  commitCloudSessionRelink,
  readCloudSession
} from '../cloud-session/profile-cloud-session-owner'

export async function selectCloudOrg(input: {
  config: OpenKodoCloudAuthConfig
  active: ActiveOpenKodoProfileState
  userDataPath: string
  orgId: string
}): Promise<OpenKodoProfileListState | null> {
  const profileId = input.active.profile.id
  const cloud = input.active.profile.cloud
  const stored = readCloudSession(profileId, input.userDataPath)
  if (!cloud || stored.status !== 'found') {
    return null
  }
  const ticket = beginCloudSessionRelink(profileId, input.userDataPath)
  let selected
  try {
    selected = await selectOpenKodoCloudOrg(input.config, stored.session, input.orgId)
  } catch (error) {
    if (!(error instanceof OpenKodoCloudRequestError) || error.statusCode !== 401) {
      throw error
    }
    const refreshed = await forceRefreshOpenKodoCloudSession(
      input.config,
      input.active,
      input.userDataPath,
      stored.session
    )
    if (refreshed.status !== 'found') {
      throw error
    }
    selected = await selectOpenKodoCloudOrg(input.config, refreshed.session, input.orgId)
  }
  if (
    selected.cloud.userId !== cloud.userId ||
    selected.cloud.cloudProfileId !== cloud.cloudProfileId ||
    selected.cloud.activeOrgId !== input.orgId
  ) {
    throw new Error('openkodo_cloud_org_selection_identity_mismatch')
  }
  const list = commitCloudSessionRelink(profileId, input.userDataPath, ticket, selected)
  if (!list) {
    throw new Error('stale_cloud_session_mutation')
  }
  return list
}
