import { hostname } from 'node:os'
import type {
  OpenKodoAccountMachinePlatform,
  OpenKodoAccountServerStatus,
  OpenKodoAccountSignInIntent,
  OpenKodoAccountSignInPrompt
} from '../../shared/openkodo-account-server-sign-in'
import type { CallerOwnedSignInChannel } from '../runtime/caller-owned-sign-in-flows'
import type { OpenKodoAccountService } from './openkodo-account-service'
import {
  getOpenKodoCloudAuthConfig,
  type OpenKodoCloudAuthConfig
} from './cloud-auth/profile-cloud-auth-config'
import { createOpenKodoCloudPkceSecrets } from './cloud-auth/profile-cloud-pkce'
import { readOpenKodoAccountStorage } from './openkodo-account-server-status'
import {
  probeOpenKodoServerSignIn,
  type OpenKodoServerSignInProbe
} from './openkodo-cloud-server-sign-in-probe'
import { cloudConnectLinkEpoch } from './cloud-auth/profile-cloud-connect-attempts'
import {
  closeServerSignInRequest,
  startServerSignInRequest,
  type ServerSignInMoveContext,
  type ServerSignInRequestBody
} from './openkodo-cloud-server-sign-in-requests'
import {
  ACCOUNT_CHANGED,
  awaitServerSignInApproval,
  type ServerSignInApprovalDeps
} from './openkodo-server-sign-in-approval'

const DEFAULT_SERVER_CLIENT_ID = 'openkodo-server'
const HOSTED_CODE_PAGE_PATH = '/v1/desktop/auth/server-sign-in/code'
// The cloud's code lives 5 minutes; a flow nobody finishes stops holding the host after 10.
const FLOW_TTL_MS = 10 * 60 * 1000

export type SignInCode = { code: string; state: string; redirectUri: string }
export type SignInResult = { account: OpenKodoAccountServerStatus }
// The flow's kind stays on the host; clients still see only the intent.
export type SignInProvider = OpenKodoAccountSignInIntent | `${OpenKodoAccountSignInIntent}:approve`
type SignInChannel = CallerOwnedSignInChannel<OpenKodoAccountSignInPrompt, SignInCode>

export type OpenKodoServerSignInDeps = {
  account: Pick<
    OpenKodoAccountService,
    'getAuthStatus' | 'signInWithCode' | 'selectOrg' | 'signOut' | 'refreshAuth'
  > &
    Partial<Pick<OpenKodoAccountService, 'onSignOutStarted' | 'signInContext'>>
  probe?: OpenKodoServerSignInProbe
  env?: NodeJS.ProcessEnv
  machineLabel?: () => string
  platform?: NodeJS.Platform
  startRequest?: typeof startServerSignInRequest
  closeRequest?: typeof closeServerSignInRequest
  approval?: ServerSignInApprovalDeps
}

/** Runs one sign-in on the host: the PKCE secrets are made and kept here, and only the exchange
 * result leaves. Paste mode waits for a relayed code; approve mode polls OpenKodo Cloud. */
export async function runServerSignIn(
  deps: OpenKodoServerSignInDeps,
  provider: SignInProvider,
  channel: SignInChannel,
  publish: () => OpenKodoAccountServerStatus
): Promise<SignInResult> {
  // Bound before any await: a sign-out or another sign-in after this point makes this one stale.
  const epoch = cloudConnectLinkEpoch()
  const isSuperseded = (): boolean => cloudConnectLinkEpoch() !== epoch
  const configState = getOpenKodoCloudAuthConfig(deps.env)
  if (!configState.configured) {
    throw new Error(configState.setupMessage)
  }
  const config = configState.config
  const storage = readOpenKodoAccountStorage()
  if (storage.kind === 'refused') {
    throw new Error(`OpenKodo can't save your sign-in on this server: ${storage.reason}`)
  }
  assertMayStart(deps, intentOf(provider))
  const clientId = deps.env?.OPENKODO_CLOUD_SERVER_CLIENT_ID?.trim() || DEFAULT_SERVER_CLIENT_ID
  const probe = deps.probe ?? probeOpenKodoServerSignIn
  if (!(await probe(config, clientId))) {
    throw new Error("cloud service doesn't support server sign-in yet.")
  }
  const pkce = createOpenKodoCloudPkceSecrets()
  const authorizeOrigin = new URL(config.authorizeEndpoint).origin
  const hostedCodePageUrl = `${authorizeOrigin}${HOSTED_CODE_PAGE_PATH}`
  const binding = {
    clientId,
    scope: config.scope,
    codeChallenge: pkce.codeChallenge,
    codeChallengeMethod: 'S256',
    state: pkce.state,
    nonce: pkce.nonce,
    localProfileId: deps.account.getAuthStatus().activeProfileId,
    machineLabel: (deps.machineLabel ?? hostname)().slice(0, 256),
    machinePlatform: machinePlatform(deps.platform ?? process.platform)
  } satisfies ServerSignInRequestBody
  let reply: { code: string; redirectUri: string }
  if (provider.endsWith(':approve')) {
    reply = await awaitApproval(deps, config, binding, channel, isSuperseded)
  } else {
    channel.onPrompt({
      ...binding,
      authorizeEndpoint: config.authorizeEndpoint,
      authorizeOrigin,
      hostedCodePageUrl
    })
    const pasted = await withDeadline(channel.nextCode(), FLOW_TTL_MS, channel.signal)
    if (pasted.state !== pkce.state) {
      throw new Error('That code belongs to a different sign-in. Start again.')
    }
    reply = pasted
  }
  channel.signal.throwIfAborted()
  if (isSuperseded()) {
    throw new Error(ACCOUNT_CHANGED)
  }
  // The account service checks link ownership against the exchanged identity at commit, and the
  // commit refuses if the epoch moved while the code was being exchanged.
  const result = await deps.account.signInWithCode(
    config,
    {
      code: reply.code,
      codeVerifier: pkce.codeVerifier,
      nonce: pkce.nonce,
      redirectUri: reply.redirectUri,
      state: pkce.state
    },
    { signal: channel.signal, requireSealedStorage: true, expectedLinkEpoch: epoch }
  )
  if (result.status !== 'connected') {
    throw new Error(
      result.status === 'failed'
        ? describeExchangeFailure(result.error)
        : 'The sign-in was stopped. Start it again.'
    )
  }
  console.info('[openkodo-account] Signed in')
  return { account: publish() }
}

/** Starts an OpenKodo Cloud sign-in request and waits for the person to approve it in a browser. */
async function awaitApproval(
  deps: OpenKodoServerSignInDeps,
  config: OpenKodoCloudAuthConfig,
  binding: ServerSignInRequestBody,
  channel: SignInChannel,
  isSuperseded: () => boolean
): Promise<{ code: string; redirectUri: string }> {
  const now = deps.approval?.now ?? Date.now
  const request = await (deps.startRequest ?? startServerSignInRequest)(
    config,
    binding,
    channel.signal,
    moveContext(deps)
  )
  // Only show a link on the OpenKodo Cloud this host signs in to.
  if (!isOnOrigin(request.verificationUrl, new URL(config.authorizeEndpoint).origin)) {
    throw new Error('cloud service sent a sign-in link for another site. Start again.')
  }
  channel.onPrompt({
    kind: 'approve-in-browser',
    verificationUrl: request.verificationUrl,
    userCode: request.userCode,
    machineLabel: binding.machineLabel,
    expiresAt: now() + request.expiresInSeconds * 1000
  })
  try {
    return await awaitServerSignInApproval({
      config,
      request,
      signal: channel.signal,
      isSuperseded,
      deps: deps.approval
    })
  } catch (error) {
    // Cancelled or replaced: the page in the browser says so instead of waiting to expire.
    if (channel.signal.aborted) {
      void (deps.closeRequest ?? closeServerSignInRequest)(config, request)
    }
    throw error
  }
}

/** For the approval page: the account this host was on, and who its bots' links belong to. */
function moveContext(deps: OpenKodoServerSignInDeps): ServerSignInMoveContext | undefined {
  const context = deps.account.signInContext?.()
  if (!context?.previous && !context?.links) {
    return undefined
  }
  return {
    ...(context.previous
      ? { previousUserId: context.previous.userId, previousEmail: context.previous.email }
      : {}),
    ...(context.links
      ? {
          linkOwnerUserIds: context.links.ownerUserIds.slice(0, MOVE_CONTEXT_MAX_OWNERS),
          linkedBotNames: context.links.botNames.slice(0, MOVE_CONTEXT_MAX_BOT_NAMES)
        }
      : {})
  }
}

// OpenKodo Cloud's limits on these fields; the page names five bots at most.
const MOVE_CONTEXT_MAX_OWNERS = 8
const MOVE_CONTEXT_MAX_BOT_NAMES = 5

function assertMayStart(deps: OpenKodoServerSignInDeps, intent: OpenKodoAccountSignInIntent): void {
  if (intent === 'sign-in' && deps.account.getAuthStatus().state === 'connected') {
    throw new Error('This server is already signed in. Use Switch account to change it.')
  }
}

export function intentOf(provider: SignInProvider): OpenKodoAccountSignInIntent {
  return provider.startsWith('switch-account') ? 'switch-account' : 'sign-in'
}

function isOnOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === origin
  } catch {
    return false
  }
}

function describeExchangeFailure(error: string): string {
  // The cloud spends the code on first use and expires it after five minutes.
  return /^openkodo_cloud_request_failed_4\d\d$/.test(error)
    ? "cloud service didn't accept that code. It may have expired or already been used. Start again."
    : error
}

function machinePlatform(platform: NodeJS.Platform): OpenKodoAccountMachinePlatform {
  return platform === 'darwin' ? 'macos' : platform === 'win32' ? 'windows' : 'linux'
}

function withDeadline<T>(promise: Promise<T>, ms: number, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('This sign-in expired. Start it again.')), ms)
    timer.unref?.()
    const settle = (): void => clearTimeout(timer)
    signal.addEventListener('abort', settle, { once: true })
    promise.then(
      (value) => {
        settle()
        resolve(value)
      },
      (error: unknown) => {
        settle()
        reject(error)
      }
    )
  })
}
