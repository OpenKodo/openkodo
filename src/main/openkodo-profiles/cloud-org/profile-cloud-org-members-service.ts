import type {
  OpenKodoProfileOrgInviteRevokeArgs,
  OpenKodoProfileOrgMemberChangeRoleArgs,
  OpenKodoProfileOrgMemberInviteArgs,
  OpenKodoProfileOrgMemberMutationResult,
  OpenKodoProfileOrgMemberRemoveArgs,
  OpenKodoProfileOrgMembersListResult
} from '../../../shared/openkodo-profiles/openkodo-profiles'
import type { ActiveOpenKodoProfileState } from '../profile-index-store'
import { ensureActiveOpenKodoProfile } from '../profile-index-store'
import type { OpenKodoCloudAuthConfig } from '../cloud-auth/profile-cloud-auth-config'
import {
  getOpenKodoCloudAuthConfig,
  isOpenKodoCloudDevAuthEnabled
} from '../cloud-auth/profile-cloud-auth-config'
import type { OpenKodoCloudSession } from '../cloud-session/profile-cloud-session-store'
import { OpenKodoCloudRequestError } from '../cloud-auth/profile-cloud-client'
import { runWithFreshOpenKodoCloudSession } from '../cloud-session/profile-cloud-session-refresh'
import {
  changeOpenKodoCloudOrgMemberRole,
  inviteOpenKodoCloudOrgMember,
  listOpenKodoCloudOrgMembers,
  removeOpenKodoCloudOrgMember,
  revokeOpenKodoCloudOrgInvite
} from './profile-cloud-org-members-client'
import {
  changeDevOpenKodoCloudOrgMemberRole,
  inviteDevOpenKodoCloudOrgMember,
  listDevOpenKodoCloudOrgMembers,
  removeDevOpenKodoCloudOrgMember,
  revokeDevOpenKodoCloudOrgInvite
} from './profile-cloud-dev-org-members'

type OrgCallResult<T> =
  | { status: 'ok'; value: T }
  | { status: 'reconnect-required' }
  | { status: 'request-error'; error: OpenKodoCloudRequestError }
  | { status: 'failed'; error: string }

// Only 401 should trigger session refresh; return business/permission failures as values.
async function runOrgMemberCall<T>(
  config: OpenKodoCloudAuthConfig,
  active: ActiveOpenKodoProfileState,
  userDataPath: string,
  call: (session: OpenKodoCloudSession) => Promise<T>
): Promise<OrgCallResult<T>> {
  try {
    const operation = await runWithFreshOpenKodoCloudSession(
      config,
      active,
      userDataPath,
      async (session) => {
        try {
          return { ok: true as const, value: await call(session) }
        } catch (error) {
          if (error instanceof OpenKodoCloudRequestError && error.statusCode !== 401) {
            return { ok: false as const, error }
          }
          throw error
        }
      }
    )
    if (operation.status !== 'ok') {
      return { status: 'reconnect-required' }
    }
    const outcome = operation.value
    return outcome.ok
      ? { status: 'ok', value: outcome.value }
      : { status: 'request-error', error: outcome.error }
  } catch (error) {
    return { status: 'failed', error: error instanceof Error ? error.message : String(error) }
  }
}

function mapMutationRequestError(
  error: OpenKodoCloudRequestError
): OpenKodoProfileOrgMemberMutationResult {
  switch (error.statusCode) {
    case 403:
      return { status: 'forbidden' }
    case 404:
      return { status: 'not-found' }
    case 409:
      return {
        status: 'conflict',
        reason: error.errorCode === 'already_member' ? 'already_member' : 'already_invited'
      }
    case 400:
      return {
        status: 'invalid',
        reason:
          error.errorCode === 'cannot_remove_self' ? 'cannot_remove_self' : 'cannot_change_own_role'
      }
    default:
      return { status: 'failed', error: error.message }
  }
}

function mapMutationResult(result: OrgCallResult<void>): OpenKodoProfileOrgMemberMutationResult {
  switch (result.status) {
    case 'ok':
      return { status: 'ok' }
    case 'reconnect-required':
      return { status: 'reconnect-required' }
    case 'request-error':
      return mapMutationRequestError(result.error)
    case 'failed':
      return { status: 'failed', error: result.error }
  }
}

export async function listOpenKodoProfileOrgMembers(
  userDataPath: string,
  orgId: string
): Promise<OpenKodoProfileOrgMembersListResult> {
  const active = ensureActiveOpenKodoProfile(userDataPath)
  if (isOpenKodoCloudDevAuthEnabled()) {
    return { status: 'ok', roster: listDevOpenKodoCloudOrgMembers(orgId) }
  }
  const configState = getOpenKodoCloudAuthConfig()
  if (!configState.configured) {
    return { status: 'unconfigured' }
  }
  const result = await runOrgMemberCall(configState.config, active, userDataPath, (session) =>
    listOpenKodoCloudOrgMembers(configState.config, session, orgId)
  )
  switch (result.status) {
    case 'ok':
      return { status: 'ok', roster: result.value }
    case 'reconnect-required':
      return { status: 'reconnect-required' }
    case 'request-error':
      return { status: 'failed', error: result.error.message }
    case 'failed':
      return { status: 'failed', error: result.error }
  }
}

export async function inviteOpenKodoProfileOrgMember(
  userDataPath: string,
  args: OpenKodoProfileOrgMemberInviteArgs
): Promise<OpenKodoProfileOrgMemberMutationResult> {
  const active = ensureActiveOpenKodoProfile(userDataPath)
  if (isOpenKodoCloudDevAuthEnabled()) {
    return inviteDevOpenKodoCloudOrgMember(args)
  }
  const configState = getOpenKodoCloudAuthConfig()
  if (!configState.configured) {
    return { status: 'unconfigured' }
  }
  return mapMutationResult(
    await runOrgMemberCall(configState.config, active, userDataPath, (session) =>
      inviteOpenKodoCloudOrgMember(configState.config, session, args)
    )
  )
}

export async function revokeOpenKodoProfileOrgInvite(
  userDataPath: string,
  args: OpenKodoProfileOrgInviteRevokeArgs
): Promise<OpenKodoProfileOrgMemberMutationResult> {
  const active = ensureActiveOpenKodoProfile(userDataPath)
  if (isOpenKodoCloudDevAuthEnabled()) {
    return revokeDevOpenKodoCloudOrgInvite(args)
  }
  const configState = getOpenKodoCloudAuthConfig()
  if (!configState.configured) {
    return { status: 'unconfigured' }
  }
  return mapMutationResult(
    await runOrgMemberCall(configState.config, active, userDataPath, (session) =>
      revokeOpenKodoCloudOrgInvite(configState.config, session, args)
    )
  )
}

export async function changeOpenKodoProfileOrgMemberRole(
  userDataPath: string,
  args: OpenKodoProfileOrgMemberChangeRoleArgs
): Promise<OpenKodoProfileOrgMemberMutationResult> {
  const active = ensureActiveOpenKodoProfile(userDataPath)
  if (isOpenKodoCloudDevAuthEnabled()) {
    return changeDevOpenKodoCloudOrgMemberRole(args)
  }
  const configState = getOpenKodoCloudAuthConfig()
  if (!configState.configured) {
    return { status: 'unconfigured' }
  }
  return mapMutationResult(
    await runOrgMemberCall(configState.config, active, userDataPath, (session) =>
      changeOpenKodoCloudOrgMemberRole(configState.config, session, args)
    )
  )
}

export async function removeOpenKodoProfileOrgMember(
  userDataPath: string,
  args: OpenKodoProfileOrgMemberRemoveArgs
): Promise<OpenKodoProfileOrgMemberMutationResult> {
  const active = ensureActiveOpenKodoProfile(userDataPath)
  if (isOpenKodoCloudDevAuthEnabled()) {
    return removeDevOpenKodoCloudOrgMember(args)
  }
  const configState = getOpenKodoCloudAuthConfig()
  if (!configState.configured) {
    return { status: 'unconfigured' }
  }
  return mapMutationResult(
    await runOrgMemberCall(configState.config, active, userDataPath, (session) =>
      removeOpenKodoCloudOrgMember(configState.config, session, args)
    )
  )
}
