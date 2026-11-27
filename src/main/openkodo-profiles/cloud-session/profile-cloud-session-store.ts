import { existsSync, readFileSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getSecretStore } from '../../../shared/secure-storage/secret-store'
import {
  OpenKodoCloudSessionStorageRefusedError,
  sealedStorageRefusal
} from './profile-cloud-session-sealing'
import { isUnreadableError, writeSecureJsonFile } from '../../../shared/secure-storage/secure-file'
import type {
  OpenKodoCloudCapabilities,
  OpenKodoCloudOrgSummary,
  OpenKodoCloudSessionPersistence
} from '../../../shared/openkodo-profiles/openkodo-profiles'
import { getOpenKodoProfileDirectory } from '../profile-storage-paths'
import { allowsPlaintextOpenKodoCloudSession } from '../cloud-auth/profile-cloud-auth-config'
import {
  decodeStoredOpenKodoCloudSession,
  sealedSessionFormat,
  type PersistedEncryptedSession,
  type PersistedPlaintextSession
} from './profile-cloud-session-codec'
import { observeActiveTeamSession } from '../cloud-auth/active-team-capabilities'

export type OpenKodoCloudSession = {
  accessToken: string
  refreshToken: string
  expiresAt: number
  capabilities: OpenKodoCloudCapabilities
  organizations?: OpenKodoCloudOrgSummary[]
  /** Whose tokens these are, so a profile linked to someone else never uses them. Absent on older files. */
  identity?: OpenKodoCloudSessionIdentity
}

export type OpenKodoCloudSessionIdentity = { userId: string; cloudProfileId: string }

export type OpenKodoCloudSessionReadResult =
  | { status: 'found'; session: OpenKodoCloudSession; persistence: OpenKodoCloudSessionPersistence }
  | { status: 'missing'; persistence: 'none' }
  | { status: 'decrypt-failed'; persistence: 'none'; error: string }
  /** Unlike decrypt-failed, unreadable proves nothing and must not authorize replacement. */
  | { status: 'unreadable'; persistence: 'none'; error: string }

type CachedOpenKodoCloudSession = {
  session: OpenKodoCloudSession
  persistence: Exclude<OpenKodoCloudSessionPersistence, 'none'>
}

const memorySessions = new Map<string, CachedOpenKodoCloudSession>()
export const MAX_MEMORY_CLOUD_SESSIONS = 64

function rememberMemorySession(key: string, session: CachedOpenKodoCloudSession): void {
  memorySessions.delete(key)
  memorySessions.set(key, session)
  while (memorySessions.size > MAX_MEMORY_CLOUD_SESSIONS) {
    const oldest = memorySessions.keys().next()
    if (oldest.done || oldest.value === key) {
      break
    }
    memorySessions.delete(oldest.value)
  }
}

export function openkodoCloudSessionKey(profileId: string, userDataPath: string): string {
  return `${userDataPath}\0${profileId}`
}

export function getOpenKodoCloudSessionPath(profileId: string, userDataPath: string): string {
  return join(getOpenKodoProfileDirectory(profileId, userDataPath), 'account-session.json.enc')
}

// Disk may hold spent tokens: retry unsaved rotations on reads/quit until saved or superseded.
const unsavedRotations = new Map<
  string,
  { profileId: string; userDataPath: string; session: OpenKodoCloudSession }
>()

function writeOpenKodoCloudSession(
  profileId: string,
  userDataPath: string,
  session: OpenKodoCloudSession,
  requireSealed = false
): OpenKodoCloudSessionPersistence {
  const cacheKey = openkodoCloudSessionKey(profileId, userDataPath)
  const secrets = getSecretStore()
  // Checked at write time: the store can change while a remote sign-in waits on the browser.
  const refusal = requireSealed ? sealedStorageRefusal(secrets) : null
  if (refusal) {
    throw new OpenKodoCloudSessionStorageRefusedError(refusal)
  }
  if (secrets.isEncryptionAvailable()) {
    const encrypted: PersistedEncryptedSession = {
      version: 1,
      format: sealedSessionFormat(secrets),
      savedAt: Date.now(),
      ciphertext: secrets.encryptString(JSON.stringify(session)).toString('base64')
    }
    writeSecureJsonFile(getOpenKodoCloudSessionPath(profileId, userDataPath), encrypted)
    rememberMemorySession(cacheKey, { session, persistence: 'encrypted' })
    return 'encrypted'
  }

  if (allowsPlaintextOpenKodoCloudSession()) {
    const plaintext: PersistedPlaintextSession = {
      version: 1,
      format: 'dev-plaintext-v1',
      savedAt: Date.now(),
      session
    }
    writeSecureJsonFile(getOpenKodoCloudSessionPath(profileId, userDataPath), plaintext)
    rememberMemorySession(cacheKey, { session, persistence: 'dev-plaintext' })
    return 'dev-plaintext'
  }

  // Production refresh tokens must not fall back to plaintext; retain them in memory until restart.
  rememberMemorySession(cacheKey, { session, persistence: 'memory-only' })
  return 'memory-only'
}

export function saveOpenKodoCloudSession(
  profileId: string,
  userDataPath: string,
  session: OpenKodoCloudSession,
  options: { spentOnFailure?: boolean; requireSealed?: boolean } = {}
): OpenKodoCloudSessionPersistence {
  const key = openkodoCloudSessionKey(profileId, userDataPath)
  try {
    const persistence = writeOpenKodoCloudSession(
      profileId,
      userDataPath,
      session,
      options.requireSealed
    )
    unsavedRotations.delete(key)
    observeActiveTeamSession(userDataPath, profileId, session)
    return persistence
  } catch (error) {
    if (!options.spentOnFailure) {
      throw error
    }
    // Losing rotated tokens would replay spent disk tokens and risk revoking the family.
    unsavedRotations.set(key, { profileId, userDataPath, session })
    observeActiveTeamSession(userDataPath, profileId, session)
    try {
      rmSync(getOpenKodoCloudSessionPath(profileId, userDataPath), { force: true })
    } catch {
      // A spent token left on disk costs one sign-in after restart, never a loop.
    }
    return 'memory-only'
  }
}

function retryUnsavedRotation(key: string): void {
  const unsaved = unsavedRotations.get(key)
  if (!unsaved) {
    return
  }
  try {
    writeOpenKodoCloudSession(unsaved.profileId, unsaved.userDataPath, unsaved.session)
    unsavedRotations.delete(key)
  } catch {
    // Retry unsaved rotation on the next read or quit flush.
  }
}

export function flushUnsavedOpenKodoCloudSessions(): void {
  for (const key of unsavedRotations.keys()) {
    retryUnsavedRotation(key)
  }
}

export function readOpenKodoCloudSession(
  profileId: string,
  userDataPath: string
): OpenKodoCloudSessionReadResult {
  const cacheKey = openkodoCloudSessionKey(profileId, userDataPath)
  retryUnsavedRotation(cacheKey)
  const unsaved = unsavedRotations.get(cacheKey)
  if (unsaved) {
    return { status: 'found', session: unsaved.session, persistence: 'memory-only' }
  }
  const memorySession = memorySessions.get(cacheKey)
  if (memorySession) {
    memorySessions.delete(cacheKey)
    memorySessions.set(cacheKey, memorySession)
    return {
      status: 'found',
      session: memorySession.session,
      persistence: memorySession.persistence
    }
  }

  const path = getOpenKodoCloudSessionPath(profileId, userDataPath)
  if (!existsSync(path)) {
    return { status: 'missing', persistence: 'none' }
  }

  try {
    const result = decodeStoredOpenKodoCloudSession(readFileSync(path, 'utf-8'))
    if (result.status === 'found' && result.persistence !== 'none') {
      rememberMemorySession(cacheKey, { session: result.session, persistence: result.persistence })
    }
    return result
  } catch (error) {
    if (isUnreadableError(error)) {
      return {
        status: 'unreadable',
        persistence: 'none',
        error: 'Cannot read the saved OpenKodo account session: the read failed.'
      }
    }
    return {
      status: 'decrypt-failed',
      persistence: 'none',
      error: 'Could not decrypt saved OpenKodo account session.'
    }
  }
}

export async function readStoredTeamPolicySession(
  profileId: string,
  userDataPath: string
): Promise<OpenKodoCloudSession | undefined> {
  try {
    const contents = await readFile(getOpenKodoCloudSessionPath(profileId, userDataPath), 'utf-8')
    const result = decodeStoredOpenKodoCloudSession(contents)
    return result.status === 'found' ? result.session : undefined
  } catch {
    return undefined
  }
}

export function clearOpenKodoCloudSession(profileId: string, userDataPath: string): void {
  const key = openkodoCloudSessionKey(profileId, userDataPath)
  unsavedRotations.delete(key)
  memorySessions.delete(key)
  observeActiveTeamSession(userDataPath, profileId, undefined)
  rmSync(getOpenKodoCloudSessionPath(profileId, userDataPath), { force: true })
}
