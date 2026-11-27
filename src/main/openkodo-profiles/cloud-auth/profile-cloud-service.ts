import type {
  ConnectCurrentOpenKodoProfileResult,
  CreateCloudLinkedOpenKodoProfileArgs,
  CreateCloudLinkedOpenKodoProfileResult,
  OpenKodoProfileAuthStatus,
  SelectOpenKodoProfileOrgResult,
  SignOutCurrentOpenKodoProfileResult
} from '../../../shared/openkodo-profiles/openkodo-profiles'
import { ensureActiveOpenKodoProfile } from '../profile-index-store'
import {
  getOpenKodoCloudAuthConfig,
  isOpenKodoCloudDevAuthEnabled
} from './profile-cloud-auth-config'
import {
  invalidateCloudSessionChanges,
  readCloudSession,
  signInCloudSession,
  signOutCloudSession
} from '../cloud-session/profile-cloud-session-owner'
import {
  createOpenKodoCloudProfile,
  exchangeOpenKodoCloudAuthCode,
  revokeOpenKodoCloudSession
} from './profile-cloud-client'
import { beginOpenKodoCloudPkceFlow, type OpenKodoCloudBrowserReturn } from './profile-cloud-pkce'
import { openkodoCloudCallbackOutcomeOf } from './profile-cloud-callback-page'
import {
  createCloudLinkedOpenKodoProfileRecord,
  unlinkOpenKodoProfileFromCloud
} from './profile-cloud-index'
import { runWithFreshOpenKodoCloudSession } from '../cloud-session/profile-cloud-session-refresh'
import {
  connectDevOpenKodoCloudProfile,
  createDevCloudLinkedOpenKodoProfile,
  selectDevOpenKodoCloudOrg
} from './profile-cloud-dev-service'
import { getOpenKodoProfileAuthStatusFromProfile } from './profile-cloud-auth-status'
import { selectCloudOrg } from '../cloud-org/profile-cloud-org-selection'
import {
  endOpenKodoCloudSignInProgress,
  setOpenKodoCloudSignInLink,
  startOpenKodoCloudSignInProgress
} from './profile-cloud-sign-in-progress'
import { clearRelayRegionPreferenceCache } from '../../runtime/mobile-cloud-relay/region-selection/relay-region-preference'

import './profile-cloud-capability-refresh'
import {
  commitExchangedCloudSession,
  type CloudSessionCommitGuards
} from '../cloud-session/profile-cloud-session-commit'
import * as connectAttempts from './profile-cloud-connect-attempts'

function invalidateOutstandingCloudConnectAttempts(): number {
  const epoch = connectAttempts.supersedeCloudConnectAttempts()
  endOpenKodoCloudSignInProgress()
  return epoch
}

export function getCurrentOpenKodoProfileAuthStatus(
  userDataPath: string
): OpenKodoProfileAuthStatus {
  return getOpenKodoProfileAuthStatusFromProfile(
    ensureActiveOpenKodoProfile(userDataPath),
    userDataPath
  )
}

export async function connectCurrentOpenKodoProfile(
  userDataPath: string,
  openBrowser: (url: string) => Promise<void>,
  mayCommit?: CloudSessionCommitGuards['mayCommit']
): Promise<ConnectCurrentOpenKodoProfileResult> {
  const active = ensureActiveOpenKodoProfile(userDataPath)
  if (isOpenKodoCloudDevAuthEnabled()) {
    const list = connectDevOpenKodoCloudProfile(active, userDataPath)
    return {
      status: 'connected',
      auth: getCurrentOpenKodoProfileAuthStatus(userDataPath),
      activeProfileId: list.activeProfileId,
      profiles: list.profiles
    }
  }

  const configState = getOpenKodoCloudAuthConfig()
  if (!configState.configured) {
    return {
      status: 'unconfigured',
      auth: getOpenKodoProfileAuthStatusFromProfile(active, userDataPath)
    }
  }

  const attempt = connectAttempts.beginCloudConnectAttempt()
  const browserWait = new AbortController()
  startOpenKodoCloudSignInProgress(attempt, () => browserWait.abort())
  let respondToBrowser: OpenKodoCloudBrowserReturn['respond'] | undefined
  const finish = (
    result: ConnectCurrentOpenKodoProfileResult
  ): ConnectCurrentOpenKodoProfileResult => {
    respondToBrowser?.(openkodoCloudCallbackOutcomeOf(result))
    return result
  }
  try {
    const code = await beginOpenKodoCloudPkceFlow(configState.config, active.profile.id, {
      openBrowser,
      signal: browserWait.signal,
      onAuthorizeUrl: (link) => setOpenKodoCloudSignInLink(attempt, link)
    })
    respondToBrowser = code.respond
    // The browser came back, so its link is spent.
    setOpenKodoCloudSignInLink(attempt, null)
    if (connectAttempts.isCloudConnectAttemptSuperseded(attempt)) {
      return finish({
        status: 'cancelled',
        auth: getCurrentOpenKodoProfileAuthStatus(userDataPath)
      })
    }
    const exchange = await exchangeOpenKodoCloudAuthCode(configState.config, {
      ...code,
      localProfileId: active.profile.id
    })
    const outcome = await commitExchangedCloudSession({
      config: configState.config,
      profileId: active.profile.id,
      userDataPath,
      attempt,
      exchange,
      guards: { mayCommit }
    })
    if (outcome.status === 'cancelled') {
      return finish({
        status: 'cancelled',
        auth: getCurrentOpenKodoProfileAuthStatus(userDataPath)
      })
    }
    if (outcome.status === 'refused') {
      return finish({
        status: 'failed',
        auth: getCurrentOpenKodoProfileAuthStatus(userDataPath),
        error: outcome.error
      })
    }
    return finish({
      status: 'connected',
      auth: getCurrentOpenKodoProfileAuthStatus(userDataPath),
      activeProfileId: outcome.list.activeProfileId,
      profiles: outcome.list.profiles
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (
      message === 'openkodo_cloud_auth_timeout' &&
      connectAttempts.isNewestCloudConnectAttempt(attempt)
    ) {
      return finish({
        status: 'timed-out',
        auth: getCurrentOpenKodoProfileAuthStatus(userDataPath)
      })
    }
    if (
      message === 'openkodo_cloud_auth_timeout' ||
      message === 'openkodo_cloud_auth_denied' ||
      message === 'openkodo_cloud_auth_cancelled'
    ) {
      return finish({
        status: 'cancelled',
        auth: getCurrentOpenKodoProfileAuthStatus(userDataPath)
      })
    }
    return finish({
      status: 'failed',
      auth: getCurrentOpenKodoProfileAuthStatus(userDataPath),
      error: message
    })
  } finally {
    endOpenKodoCloudSignInProgress(attempt)
  }
}

export async function signOutCurrentOpenKodoProfile(
  userDataPath: string
): Promise<SignOutCurrentOpenKodoProfileResult> {
  // Pending browser sign-ins must not relink after explicit sign-out.
  const signOutEpoch = invalidateOutstandingCloudConnectAttempts()
  const active = ensureActiveOpenKodoProfile(userDataPath)
  const configState = getOpenKodoCloudAuthConfig()
  const session = readCloudSession(active.profile.id, userDataPath)
  // Fence before network I/O so in-flight refreshes cannot save after sign-out.
  invalidateCloudSessionChanges(active.profile.id, userDataPath)
  if (!isOpenKodoCloudDevAuthEnabled() && configState.configured && session.status === 'found') {
    await revokeOpenKodoCloudSession(configState.config, session.session).catch(() => undefined)
  }
  if (connectAttempts.cloudConnectLinkEpoch() > signOutEpoch) {
    const current = ensureActiveOpenKodoProfile(userDataPath)
    return {
      status: 'signed-out',
      auth: getCurrentOpenKodoProfileAuthStatus(userDataPath),
      activeProfileId: current.index.activeProfileId,
      profiles: current.index.profiles
    }
  }
  signOutCloudSession(active.profile.id, userDataPath)
  const list = unlinkOpenKodoProfileFromCloud(active.profile.id, userDataPath)
  try {
    clearRelayRegionPreferenceCache(userDataPath)
  } catch {
    // A leftover latency cache must not fail the sign-out itself.
  }
  return {
    status: 'signed-out',
    auth: getCurrentOpenKodoProfileAuthStatus(userDataPath),
    activeProfileId: list.activeProfileId,
    profiles: list.profiles
  }
}

export async function createCloudLinkedOpenKodoProfile(
  userDataPath: string,
  args: CreateCloudLinkedOpenKodoProfileArgs
): Promise<CreateCloudLinkedOpenKodoProfileResult> {
  const active = ensureActiveOpenKodoProfile(userDataPath)
  if (isOpenKodoCloudDevAuthEnabled()) {
    const result = createDevCloudLinkedOpenKodoProfile(active, userDataPath, args)
    if (result.status !== 'created') {
      return {
        status: 'reconnect-required',
        auth: getOpenKodoProfileAuthStatusFromProfile(active, userDataPath)
      }
    }
    return {
      status: 'created',
      auth: getCurrentOpenKodoProfileAuthStatus(userDataPath),
      activeProfileId: result.list.activeProfileId,
      profiles: result.list.profiles,
      profile: result.list.profile
    }
  }

  const configState = getOpenKodoCloudAuthConfig()
  if (!configState.configured) {
    return {
      status: 'unconfigured',
      auth: getOpenKodoProfileAuthStatusFromProfile(active, userDataPath)
    }
  }
  try {
    const operation = await runWithFreshOpenKodoCloudSession(
      configState.config,
      active,
      userDataPath,
      (session) => createOpenKodoCloudProfile(configState.config, session, args)
    )
    if (operation.status !== 'ok') {
      return {
        status: 'reconnect-required',
        auth: getOpenKodoProfileAuthStatusFromProfile(active, userDataPath)
      }
    }
    const created = operation.value
    const list = createCloudLinkedOpenKodoProfileRecord(
      created.cloud,
      { name: args.name },
      userDataPath
    )
    signInCloudSession(list.profile.id, userDataPath, created)
    return {
      status: 'created',
      auth: getCurrentOpenKodoProfileAuthStatus(userDataPath),
      activeProfileId: list.activeProfileId,
      profiles: list.profiles,
      profile: list.profile
    }
  } catch (error) {
    return {
      status: 'failed',
      auth: getCurrentOpenKodoProfileAuthStatus(userDataPath),
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export async function selectCurrentOpenKodoProfileOrg(
  userDataPath: string,
  orgId: string
): Promise<SelectOpenKodoProfileOrgResult> {
  const active = ensureActiveOpenKodoProfile(userDataPath)
  if (isOpenKodoCloudDevAuthEnabled()) {
    const result = selectDevOpenKodoCloudOrg(active, userDataPath, orgId)
    if (result.status !== 'updated') {
      return {
        status: 'reconnect-required',
        auth: getOpenKodoProfileAuthStatusFromProfile(active, userDataPath)
      }
    }
    return {
      status: 'selected',
      auth: getCurrentOpenKodoProfileAuthStatus(userDataPath),
      activeProfileId: result.list.activeProfileId,
      profiles: result.list.profiles
    }
  }

  const configState = getOpenKodoCloudAuthConfig()
  if (!configState.configured) {
    return {
      status: 'unconfigured',
      auth: getOpenKodoProfileAuthStatusFromProfile(active, userDataPath)
    }
  }
  try {
    const list = await selectCloudOrg({
      config: configState.config,
      active,
      userDataPath,
      orgId
    })
    if (!list) {
      return {
        status: 'reconnect-required',
        auth: getOpenKodoProfileAuthStatusFromProfile(active, userDataPath)
      }
    }
    return {
      status: 'selected',
      auth: getCurrentOpenKodoProfileAuthStatus(userDataPath),
      activeProfileId: list.activeProfileId,
      profiles: list.profiles
    }
  } catch (error) {
    return {
      status: 'failed',
      auth: getCurrentOpenKodoProfileAuthStatus(userDataPath),
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
