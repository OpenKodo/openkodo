import type { ConnectCurrentOpenKodoProfileResult } from '../../../shared/openkodo-profiles/openkodo-profiles'
import type { OpenKodoCloudAuthConfig } from './profile-cloud-auth-config'
import { exchangeOpenKodoCloudAuthCode } from './profile-cloud-client'
import { beginCloudConnectAttempt } from './profile-cloud-connect-attempts'
import type { OpenKodoCloudAuthorizationCode } from './profile-cloud-pkce'
import { getCurrentOpenKodoProfileAuthStatus } from './profile-cloud-service'
import {
  commitExchangedCloudSession,
  type CloudSessionCommitGuards
} from '../cloud-session/profile-cloud-session-commit'
import { ensureActiveOpenKodoProfile } from '../profile-index-store'

/** Redeems a code whose browser leg ran on another device; the verifier never left this host. */
export async function signInCurrentOpenKodoProfileWithCode(
  userDataPath: string,
  config: OpenKodoCloudAuthConfig,
  code: OpenKodoCloudAuthorizationCode,
  guards: CloudSessionCommitGuards = {}
): Promise<ConnectCurrentOpenKodoProfileResult> {
  const active = ensureActiveOpenKodoProfile(userDataPath)
  const attempt = beginCloudConnectAttempt()
  const auth = () => getCurrentOpenKodoProfileAuthStatus(userDataPath)
  let exchange: Awaited<ReturnType<typeof exchangeOpenKodoCloudAuthCode>>
  try {
    exchange = await exchangeOpenKodoCloudAuthCode(config, {
      ...code,
      localProfileId: active.profile.id
    })
  } catch (error) {
    return {
      status: 'failed',
      auth: auth(),
      error: error instanceof Error ? error.message : String(error)
    }
  }
  const outcome = await commitExchangedCloudSession({
    config,
    profileId: active.profile.id,
    userDataPath,
    attempt,
    exchange,
    guards
  })
  if (outcome.status === 'cancelled') {
    return { status: 'cancelled', auth: auth() }
  }
  if (outcome.status === 'refused') {
    return { status: 'failed', auth: auth(), error: outcome.error }
  }
  return {
    status: 'connected',
    auth: auth(),
    activeProfileId: outcome.list.activeProfileId,
    profiles: outcome.list.profiles
  }
}
