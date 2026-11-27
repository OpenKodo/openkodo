import type { RefreshCurrentOpenKodoProfileAuthResult } from '../../../shared/openkodo-profiles/openkodo-profiles'
import {
  getOpenKodoCloudAuthConfig,
  isOpenKodoCloudDevAuthEnabled
} from './profile-cloud-auth-config'
import { getOpenKodoProfileAuthStatusFromProfile } from './profile-cloud-auth-status'
import {
  refreshOpenKodoCloudCapabilities,
  uploadDesktopReportAfterCapabilityRefresh
} from './profile-cloud-client'
import { ensureActiveOpenKodoProfile } from '../profile-index-store'
import { refreshDevOpenKodoCloudProfile } from './profile-cloud-dev-service'
import {
  commitCloudSessionCapabilities,
  takeCloudSessionTicket,
  type CloudSessionTicket
} from '../cloud-session/profile-cloud-session-owner'
import { runWithFreshOpenKodoCloudSession } from '../cloud-session/profile-cloud-session-refresh'

export async function refreshCurrentOpenKodoProfileAuth(
  userDataPath: string
): Promise<RefreshCurrentOpenKodoProfileAuthResult> {
  const active = ensureActiveOpenKodoProfile(userDataPath)
  const auth = () => getOpenKodoProfileAuthStatusFromProfile(active, userDataPath)
  if (!active.profile.cloud) {
    return { status: 'local', auth: auth() }
  }
  if (isOpenKodoCloudDevAuthEnabled()) {
    const result = refreshDevOpenKodoCloudProfile(active, userDataPath)
    if (result.status !== 'updated') {
      return { status: 'reconnect-required', auth: auth() }
    }
    return {
      status: 'refreshed',
      auth: auth(),
      activeProfileId: result.list.activeProfileId,
      profiles: result.list.profiles
    }
  }
  const configState = getOpenKodoCloudAuthConfig()
  if (!configState.configured) {
    return { status: 'unconfigured', auth: auth() }
  }
  try {
    const cloud = active.profile.cloud
    let ticket: CloudSessionTicket | undefined
    const operation = await runWithFreshOpenKodoCloudSession(
      configState.config,
      active,
      userDataPath,
      async (session) => {
        // Take the ticket after refresh because refreshing may relink the session.
        ticket = takeCloudSessionTicket(active.profile.id, userDataPath)
        return {
          session,
          refresh: await refreshOpenKodoCloudCapabilities(configState.config, session)
        }
      }
    )
    if (operation.status !== 'ok' || !ticket) {
      return { status: 'reconnect-required', auth: auth() }
    }
    const { refresh, session } = operation.value
    if (
      refresh.cloud &&
      (refresh.cloud.userId !== cloud.userId ||
        refresh.cloud.cloudProfileId !== cloud.cloudProfileId)
    ) {
      throw new Error('openkodo_cloud_identity_changed_during_capability_refresh')
    }
    const list = commitCloudSessionCapabilities(active.profile.id, userDataPath, ticket, refresh)
    if (!list) {
      return { status: 'reconnect-required', auth: auth() }
    }
    if (list.activeProfileId === active.profile.id) {
      // Reporting is separate so inventory outages do not affect sign-in or policy refresh.
      void uploadDesktopReportAfterCapabilityRefresh(
        configState.config,
        session,
        refresh.capabilities
      ).catch(() => undefined)
    }
    return {
      status: 'refreshed',
      auth: getOpenKodoProfileAuthStatusFromProfile(
        ensureActiveOpenKodoProfile(userDataPath),
        userDataPath
      ),
      activeProfileId: list.activeProfileId,
      profiles: list.profiles
    }
  } catch (error) {
    return {
      status: 'failed',
      auth: auth(),
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
