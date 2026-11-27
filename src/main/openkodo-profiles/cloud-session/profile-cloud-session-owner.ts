import type {
  OpenKodoCloudCapabilities,
  OpenKodoCloudOrgSummary,
  OpenKodoProfileCloudSummary,
  OpenKodoProfileListState
} from '../../../shared/openkodo-profiles/openkodo-profiles'
import { linkOpenKodoProfileToCloud } from '../cloud-auth/profile-cloud-index'
import { getOpenKodoProfileListState, loadOrCreateProfileIndex } from '../profile-index-store'
import type { OpenKodoCloudSessionExchangeResponse } from './profile-cloud-session-exchange'
import {
  clearOpenKodoCloudSession,
  flushUnsavedOpenKodoCloudSessions,
  openkodoCloudSessionKey,
  readOpenKodoCloudSession,
  saveOpenKodoCloudSession,
  type OpenKodoCloudSession,
  type OpenKodoCloudSessionReadResult
} from './profile-cloud-session-store'

// All session reads/writes pass through this owner; callers request changes instead of replacing state.

type SessionOwnerState = {
  // Sign-in/out fences older in-flight changes.
  generation: number
  // Org changes invalidate old metadata replies, but their rotated tokens must still land.
  linkVersion: number
  // Ignore disk after sign-out even if deletion failed.
  signedOut: boolean
}

export type CloudSessionTicket = { generation: number; linkVersion: number }

export type CloudSessionServerReply = {
  cloud?: OpenKodoProfileCloudSummary
  organizations?: OpenKodoCloudOrgSummary[]
  capabilities: OpenKodoCloudCapabilities
}

const owners = new Map<string, SessionOwnerState>()

function ownerOf(profileId: string, userDataPath: string): SessionOwnerState {
  const key = openkodoCloudSessionKey(profileId, userDataPath)
  let owner = owners.get(key)
  if (!owner) {
    owner = { generation: 0, linkVersion: 0, signedOut: false }
    owners.set(key, owner)
  }
  return owner
}

function isSameOrgAsLink(
  profileId: string,
  userDataPath: string,
  cloud: OpenKodoProfileCloudSummary
): boolean {
  const linked = loadOrCreateProfileIndex(userDataPath).profiles.find(
    (profile) => profile.id === profileId
  )?.cloud
  return (linked?.activeOrgId ?? '') === (cloud.activeOrgId ?? '')
}

function relink(
  owner: SessionOwnerState,
  profileId: string,
  userDataPath: string,
  cloud: OpenKodoProfileCloudSummary
): OpenKodoProfileListState {
  const orgChanged = !isSameOrgAsLink(profileId, userDataPath, cloud)
  const list = linkOpenKodoProfileToCloud(profileId, cloud, userDataPath)
  if (orgChanged) {
    owner.linkVersion++
  }
  return list
}

export function readCloudSession(
  profileId: string,
  userDataPath: string
): OpenKodoCloudSessionReadResult {
  if (ownerOf(profileId, userDataPath).signedOut) {
    return { status: 'missing', persistence: 'none' }
  }
  return readOpenKodoCloudSession(profileId, userDataPath)
}

/** Take before requests whose replies mutate the session. */
export function takeCloudSessionTicket(
  profileId: string,
  userDataPath: string
): CloudSessionTicket {
  const owner = ownerOf(profileId, userDataPath)
  return { generation: owner.generation, linkVersion: owner.linkVersion }
}

export function sessionFromExchange(
  exchange: OpenKodoCloudSessionExchangeResponse
): OpenKodoCloudSession {
  return {
    accessToken: exchange.accessToken,
    refreshToken: exchange.refreshToken,
    expiresAt: exchange.expiresAt,
    organizations: exchange.organizations,
    capabilities: exchange.capabilities,
    identity: { userId: exchange.cloud.userId, cloudProfileId: exchange.cloud.cloudProfileId }
  }
}

/** `requireSealed` refuses memory-only and plaintext saves instead of falling back. */
export function signInCloudSession(
  profileId: string,
  userDataPath: string,
  exchange: OpenKodoCloudSessionExchangeResponse,
  options: { requireSealed?: boolean } = {}
): void {
  saveOpenKodoCloudSession(profileId, userDataPath, sessionFromExchange(exchange), options)
  invalidateCloudSessionChanges(profileId, userDataPath)
  ownerOf(profileId, userDataPath).signedOut = false
}

/** Puts back the session an unfinished account change replaced; with none, signs out. */
export function restoreCloudSession(
  profileId: string,
  userDataPath: string,
  previous: OpenKodoCloudSessionReadResult
): void {
  if (previous.status === 'found') {
    try {
      saveOpenKodoCloudSession(profileId, userDataPath, previous.session)
      invalidateCloudSessionChanges(profileId, userDataPath)
      ownerOf(profileId, userDataPath).signedOut = false
      return
    } catch {
      // The replacement's identity stamp keeps it from being used as the profile's account.
    }
  }
  signOutCloudSession(profileId, userDataPath)
}

export function invalidateCloudSessionChanges(profileId: string, userDataPath: string): void {
  const owner = ownerOf(profileId, userDataPath)
  owner.generation++
  owner.linkVersion++
}

export function signOutCloudSession(profileId: string, userDataPath: string): void {
  invalidateCloudSessionChanges(profileId, userDataPath)
  ownerOf(profileId, userDataPath).signedOut = true
  try {
    clearOpenKodoCloudSession(profileId, userDataPath)
  } catch {
    // `signedOut` already hides the file, so a revoked token is never read back.
  }
}

// Clear only the token that failed; losing refresh racers must not erase the winner’s session.
export function signOutRevokedCloudSession(
  profileId: string,
  userDataPath: string,
  failed: OpenKodoCloudSession
): boolean {
  const current = readCloudSession(profileId, userDataPath)
  if (current.status === 'found' && current.session.refreshToken !== failed.refreshToken) {
    return false
  }
  // An unreadable token may differ from the failed one, so deletion is unsafe.
  if (current.status === 'unreadable') {
    return false
  }
  signOutCloudSession(profileId, userDataPath)
  return true
}

/** Save rotated tokens unless signed out/replaced: retaining spent tokens can revoke the family.
 * Apply org metadata only if the link has not moved; persist tokens before the best-effort link. */
export function commitCloudSessionRotation(
  profileId: string,
  userDataPath: string,
  ticket: CloudSessionTicket,
  spent: OpenKodoCloudSession,
  rotated: OpenKodoCloudSessionExchangeResponse
): OpenKodoCloudSession | null {
  const owner = ownerOf(profileId, userDataPath)
  const current = readCloudSession(profileId, userDataPath)
  if (
    owner.generation !== ticket.generation ||
    current.status !== 'found' ||
    current.session.refreshToken !== spent.refreshToken
  ) {
    return null
  }
  const tokens = {
    accessToken: rotated.accessToken,
    refreshToken: rotated.refreshToken,
    expiresAt: rotated.expiresAt
  }
  const linkUnmoved = owner.linkVersion === ticket.linkVersion
  const next = linkUnmoved
    ? {
        ...tokens,
        organizations: rotated.organizations,
        capabilities: rotated.capabilities,
        identity: current.session.identity
      }
    : { ...current.session, ...tokens }
  saveOpenKodoCloudSession(profileId, userDataPath, next, { spentOnFailure: true })
  if (linkUnmoved) {
    try {
      relink(owner, profileId, userDataPath, rotated.cloud)
    } catch {
      // The tokens are saved; the link is retried by the next refresh or org change.
    }
  }
  return next
}

// Move the org link before requesting so in-flight refreshes cannot restore the old org.
export function beginCloudSessionRelink(
  profileId: string,
  userDataPath: string
): CloudSessionTicket {
  ownerOf(profileId, userDataPath).linkVersion++
  return takeCloudSessionTicket(profileId, userDataPath)
}

function commitServerReply(
  profileId: string,
  userDataPath: string,
  ticket: CloudSessionTicket,
  reply: CloudSessionServerReply,
  acceptsSameOrg: boolean
): OpenKodoProfileListState | null {
  const owner = ownerOf(profileId, userDataPath)
  const current = readCloudSession(profileId, userDataPath)
  const linkMoved =
    owner.linkVersion !== ticket.linkVersion &&
    !(acceptsSameOrg && reply.cloud && isSameOrgAsLink(profileId, userDataPath, reply.cloud))
  if (owner.generation !== ticket.generation || current.status !== 'found' || linkMoved) {
    return null
  }
  saveOpenKodoCloudSession(profileId, userDataPath, {
    ...current.session,
    organizations: reply.organizations ?? current.session.organizations,
    capabilities: reply.capabilities
  })
  return reply.cloud
    ? relink(owner, profileId, userDataPath, reply.cloud)
    : getOpenKodoProfileListState(userDataPath)
}

/** Leave tokens untouched; an already-selected org still counts as committed. */
export function commitCloudSessionRelink(
  profileId: string,
  userDataPath: string,
  ticket: CloudSessionTicket,
  reply: CloudSessionServerReply
): OpenKodoProfileListState | null {
  return commitServerReply(profileId, userDataPath, ticket, reply, true)
}

/** Refuse capability replies if the org link moved after the ticket. */
export function commitCloudSessionCapabilities(
  profileId: string,
  userDataPath: string,
  ticket: CloudSessionTicket,
  reply: CloudSessionServerReply
): OpenKodoProfileListState | null {
  return commitServerReply(profileId, userDataPath, ticket, reply, false)
}

export function flushUnsavedCloudSessions(): void {
  flushUnsavedOpenKodoCloudSessions()
}
