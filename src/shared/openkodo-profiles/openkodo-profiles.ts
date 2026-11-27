import './constants'
import { OPENKODO_BROWSER_PARTITION } from '../browser/browser-session-partition'
import type { ExecutionHostId } from '../execution-host/execution-host'
import type { OpenKodoCloudCapabilities } from './openkodo-cloud-capabilities'

export const OPENKODO_PROFILE_INDEX_SCHEMA_VERSION = 1
export const DEFAULT_LOCAL_OPENKODO_PROFILE_ID = 'local-default'
export const DEFAULT_LOCAL_OPENKODO_PROFILE_NAME = 'Personal'
/** Main -> renderer push when the stored auth status changed without the renderer asking. */
export const OPENKODO_PROFILE_AUTH_STATUS_CHANGED_CHANNEL = 'openkodoProfiles:authStatusChanged'
export const OPENKODO_PROFILE_SIGN_IN_PROGRESS_CHANGED_CHANNEL =
  'openkodoProfiles:signInProgressChanged'
const LEGACY_OPENKODO_BROWSER_SESSION_PARTITION_PREFIX = 'persist:openkodo-browser-session-'

export type OpenKodoProfileAvatar = {
  kind: 'initials'
  initials: string
  color: 'neutral'
}

export type OpenKodoProfileKind = 'local' | 'cloud-linked'

export type OpenKodoProfileCloudSummary = {
  cloudProfileId: string
  userId: string
  email: string
  displayName?: string
  activeOrgId?: string
  activeOrgName?: string
  linkedAt: number
}

export type OpenKodoCloudOrgSummary = {
  orgId: string
  name: string
  role?: string
}

export type {
  OpenKodoCloudCapabilities,
  OpenKodoCloudCapabilityFlags
} from './openkodo-cloud-capabilities'

export type OpenKodoCloudSessionPersistence = 'none' | 'encrypted' | 'memory-only' | 'dev-plaintext'

export type OpenKodoProfileAuthState = 'local' | 'unconfigured' | 'connected' | 'reconnect-required'

export type OpenKodoProfileAuthStatus = {
  activeProfileId: string
  configured: boolean
  state: OpenKodoProfileAuthState
  persistence: OpenKodoCloudSessionPersistence
  cloud?: OpenKodoProfileCloudSummary
  organizations?: OpenKodoCloudOrgSummary[]
  capabilities?: OpenKodoCloudCapabilities
  credentialError?: string
  setupMessage?: string
}

export type OpenKodoProfileSummary = {
  id: string
  name: string
  avatar: OpenKodoProfileAvatar
  kind: OpenKodoProfileKind
  createdAt: number
  updatedAt: number
  lastOpenedAt: number
  cloud?: OpenKodoProfileCloudSummary
}

export type OpenKodoProfileIndex = {
  schemaVersion: number
  activeProfileId: string
  profiles: OpenKodoProfileSummary[]
}

export type OpenKodoProfileListState = {
  activeProfileId: string
  profiles: OpenKodoProfileSummary[]
}

export type OpenKodoProfileListResult = OpenKodoProfileListState & {
  // Gate the multi-profile switcher; default builds use one-profile account menus.
  multiProfileUi: boolean
}

export type CreateLocalOpenKodoProfileArgs = {
  name?: string
}

export type CreateLocalOpenKodoProfileResult = OpenKodoProfileListState & {
  profile: OpenKodoProfileSummary
}

export type CreateCloudLinkedOpenKodoProfileArgs = {
  orgId?: string
  name?: string
}

export type SwitchOpenKodoProfileArgs = {
  profileId: string
}

export type SwitchOpenKodoProfileResult = {
  status: 'already-active' | 'relaunching'
}

export type TransferOpenKodoProfileProjectMode = 'move' | 'copy'

export type TransferOpenKodoProfileProjectArgs = {
  sourceProfileId: string
  targetProfileId: string
  repoId: string
  mode: TransferOpenKodoProfileProjectMode
}

export type FindOpenKodoProfileProjectsByPathArgs = {
  path: string
  connectionId?: string | null
  executionHostId?: ExecutionHostId | null
  excludeProfileId?: string | null
}

export type OpenKodoProfileProjectPresence = {
  profileId: string
  profileName: string
  profileKind: OpenKodoProfileKind
  repoId: string
  repoName: string
}

export type FindOpenKodoProfileProjectsByPathResult = {
  projects: OpenKodoProfileProjectPresence[]
}

export type TransferOpenKodoProfileProjectResult =
  | {
      status: 'transferred'
      mode: TransferOpenKodoProfileProjectMode
      sourceProfileId: string
      targetProfileId: string
      sourceRepoId: string
      targetRepoId: string
      targetProjectId: string | null
      willRelaunch?: boolean
    }
  | {
      status: 'duplicate-target'
      sourceProfileId: string
      targetProfileId: string
      sourceRepoId: string
      duplicateRepoId: string
    }

/** A sign-in in flight; `link` is set only while the browser has not answered yet. */
export type OpenKodoCloudSignInProgress = { link: string | null }

export type ConnectCurrentOpenKodoProfileResult =
  | {
      status: 'connected'
      auth: OpenKodoProfileAuthStatus
      activeProfileId: string
      profiles: OpenKodoProfileSummary[]
    }
  | {
      status: 'unconfigured'
      auth: OpenKodoProfileAuthStatus
    }
  | {
      status: 'cancelled'
      auth: OpenKodoProfileAuthStatus
    }
  | {
      status: 'timed-out'
      auth: OpenKodoProfileAuthStatus
    }
  | {
      status: 'failed'
      auth: OpenKodoProfileAuthStatus
      error: string
    }

export type CreateCloudLinkedOpenKodoProfileResult =
  | {
      status: 'created'
      auth: OpenKodoProfileAuthStatus
      activeProfileId: string
      profiles: OpenKodoProfileSummary[]
      profile: OpenKodoProfileSummary
    }
  | {
      status: 'unconfigured' | 'reconnect-required'
      auth: OpenKodoProfileAuthStatus
    }
  | {
      status: 'failed'
      auth: OpenKodoProfileAuthStatus
      error: string
    }

export type SignOutCurrentOpenKodoProfileResult = {
  status: 'signed-out'
  auth: OpenKodoProfileAuthStatus
  activeProfileId: string
  profiles: OpenKodoProfileSummary[]
}

export type SelectOpenKodoProfileOrgArgs = {
  orgId: string
}

export type SelectOpenKodoProfileOrgResult =
  | {
      status: 'selected'
      auth: OpenKodoProfileAuthStatus
      activeProfileId: string
      profiles: OpenKodoProfileSummary[]
    }
  | {
      status: 'unconfigured' | 'reconnect-required'
      auth: OpenKodoProfileAuthStatus
    }
  | {
      status: 'failed'
      auth: OpenKodoProfileAuthStatus
      error: string
    }

export type RefreshCurrentOpenKodoProfileAuthResult =
  | {
      status: 'refreshed'
      auth: OpenKodoProfileAuthStatus
      activeProfileId: string
      profiles: OpenKodoProfileSummary[]
    }
  | {
      status: 'local' | 'unconfigured' | 'reconnect-required'
      auth: OpenKodoProfileAuthStatus
    }
  | {
      status: 'failed'
      auth: OpenKodoProfileAuthStatus
      error: string
    }

// Mirror the server’s fixed role enum so UI options cannot drift from accepted API values.
export type OpenKodoOrgRole = 'owner' | 'admin' | 'member'

export type OpenKodoOrgMember = {
  // Provisioned teammates without sign-in have no userId; disable mutations requiring that key.
  userId: string | null
  email: string
  displayName?: string
  role: OpenKodoOrgRole
}

export type OpenKodoOrgPendingInvite = {
  email: string
  role: OpenKodoOrgRole
  createdAt: number
}

export type OpenKodoOrgMembersRoster = {
  members: OpenKodoOrgMember[]
  pendingInvites: OpenKodoOrgPendingInvite[]
  viewerRole: OpenKodoOrgRole
  canManageMembers: boolean
}

export type OpenKodoProfileOrgMembersListArgs = {
  orgId: string
}

export type OpenKodoProfileOrgMemberInviteArgs = {
  orgId: string
  email: string
  role: OpenKodoOrgRole
}

export type OpenKodoProfileOrgInviteRevokeArgs = {
  orgId: string
  email: string
}

export type OpenKodoProfileOrgMemberChangeRoleArgs = {
  orgId: string
  userId: string
  role: OpenKodoOrgRole
}

export type OpenKodoProfileOrgMemberRemoveArgs = {
  orgId: string
  userId: string
}

export type OpenKodoProfileOrgMembersListResult =
  | { status: 'ok'; roster: OpenKodoOrgMembersRoster }
  | { status: 'unconfigured' | 'reconnect-required' }
  | { status: 'failed'; error: string }

export type OpenKodoOrgInviteConflictReason = 'already_member' | 'already_invited'
export type OpenKodoOrgMutationInvalidReason = 'cannot_change_own_role' | 'cannot_remove_self'

export type OpenKodoProfileOrgMemberMutationResult =
  | { status: 'ok' }
  | { status: 'unconfigured' | 'reconnect-required' | 'forbidden' | 'not-found' }
  | { status: 'conflict'; reason: OpenKodoOrgInviteConflictReason }
  | { status: 'invalid'; reason: OpenKodoOrgMutationInvalidReason }
  | { status: 'failed'; error: string }

export function createDefaultLocalOpenKodoProfile(now: number): OpenKodoProfileSummary {
  return {
    id: DEFAULT_LOCAL_OPENKODO_PROFILE_ID,
    name: DEFAULT_LOCAL_OPENKODO_PROFILE_NAME,
    avatar: { kind: 'initials', initials: 'P', color: 'neutral' },
    kind: 'local',
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now
  }
}

function profilePartitionHash(value: string): string {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function getOpenKodoProfileBrowserPartitionSegment(profileId: string): string {
  const safe = profileId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 48) || 'profile'
  return `${safe}-${profilePartitionHash(profileId)}`
}

export function getOpenKodoProfileBrowserDefaultPartition(profileId: string): string {
  if (profileId === DEFAULT_LOCAL_OPENKODO_PROFILE_ID) {
    return OPENKODO_BROWSER_PARTITION
  }
  return `persist:openkodo-profile-${getOpenKodoProfileBrowserPartitionSegment(profileId)}-browser-default`
}

export function getOpenKodoProfileBrowserSessionPartition(
  profileId: string,
  browserSessionProfileId: string
): string {
  if (profileId === DEFAULT_LOCAL_OPENKODO_PROFILE_ID) {
    return `${LEGACY_OPENKODO_BROWSER_SESSION_PARTITION_PREFIX}${browserSessionProfileId}`
  }
  return `persist:openkodo-profile-${getOpenKodoProfileBrowserPartitionSegment(
    profileId
  )}-browser-session-${browserSessionProfileId}`
}
