import { ipcMain } from 'electron'
import type {
  OpenKodoOrgRole,
  OpenKodoProfileOrgInviteRevokeArgs,
  OpenKodoProfileOrgMemberChangeRoleArgs,
  OpenKodoProfileOrgMemberInviteArgs,
  OpenKodoProfileOrgMemberMutationResult,
  OpenKodoProfileOrgMemberRemoveArgs,
  OpenKodoProfileOrgMembersListArgs,
  OpenKodoProfileOrgMembersListResult
} from '../../../shared/openkodo-profiles/openkodo-profiles'
import { getProfileUserDataPath } from '../../openkodo-profiles/profile-storage-paths'
import {
  changeOpenKodoProfileOrgMemberRole,
  inviteOpenKodoProfileOrgMember,
  listOpenKodoProfileOrgMembers,
  removeOpenKodoProfileOrgMember,
  revokeOpenKodoProfileOrgInvite
} from '../../openkodo-profiles/cloud-org/profile-cloud-org-members-service'

function orgMembersScopedArgs(args: unknown): { orgId: string; record: Record<string, unknown> } {
  if (!args || typeof args !== 'object') {
    throw new Error('invalid_openkodo_profile_org_selection')
  }
  const record = args as Record<string, unknown>
  const orgId = typeof record.orgId === 'string' ? record.orgId.trim() : ''
  if (!orgId) {
    throw new Error('invalid_openkodo_profile_org_selection')
  }
  return { orgId, record }
}

function orgRoleFromUnknown(value: unknown): OpenKodoOrgRole {
  if (value === 'owner' || value === 'admin' || value === 'member') {
    return value
  }
  throw new Error('invalid_openkodo_org_role')
}

function orgEmailFromUnknown(value: unknown): string {
  const email = typeof value === 'string' ? value.trim() : ''
  if (!email) {
    throw new Error('invalid_openkodo_org_member_email')
  }
  return email
}

function orgUserIdFromUnknown(value: unknown): string {
  const userId = typeof value === 'string' ? value.trim() : ''
  if (!userId) {
    throw new Error('invalid_openkodo_org_member_user')
  }
  return userId
}

function orgMemberInviteArgsFromUnknown(args: unknown): OpenKodoProfileOrgMemberInviteArgs {
  const { orgId, record } = orgMembersScopedArgs(args)
  return { orgId, email: orgEmailFromUnknown(record.email), role: orgRoleFromUnknown(record.role) }
}

function orgInviteRevokeArgsFromUnknown(args: unknown): OpenKodoProfileOrgInviteRevokeArgs {
  const { orgId, record } = orgMembersScopedArgs(args)
  return { orgId, email: orgEmailFromUnknown(record.email) }
}

function orgMemberChangeRoleArgsFromUnknown(args: unknown): OpenKodoProfileOrgMemberChangeRoleArgs {
  const { orgId, record } = orgMembersScopedArgs(args)
  return {
    orgId,
    userId: orgUserIdFromUnknown(record.userId),
    role: orgRoleFromUnknown(record.role)
  }
}

function orgMemberRemoveArgsFromUnknown(args: unknown): OpenKodoProfileOrgMemberRemoveArgs {
  const { orgId, record } = orgMembersScopedArgs(args)
  return { orgId, userId: orgUserIdFromUnknown(record.userId) }
}

export function registerOpenKodoProfileOrgMemberHandlers(): void {
  ipcMain.handle(
    'openkodoProfiles:orgMembersList',
    async (
      _event,
      rawArgs: OpenKodoProfileOrgMembersListArgs
    ): Promise<OpenKodoProfileOrgMembersListResult> =>
      listOpenKodoProfileOrgMembers(getProfileUserDataPath(), orgMembersScopedArgs(rawArgs).orgId)
  )

  ipcMain.handle(
    'openkodoProfiles:orgMemberInvite',
    async (
      _event,
      rawArgs: OpenKodoProfileOrgMemberInviteArgs
    ): Promise<OpenKodoProfileOrgMemberMutationResult> =>
      inviteOpenKodoProfileOrgMember(
        getProfileUserDataPath(),
        orgMemberInviteArgsFromUnknown(rawArgs)
      )
  )

  ipcMain.handle(
    'openkodoProfiles:orgInviteRevoke',
    async (
      _event,
      rawArgs: OpenKodoProfileOrgInviteRevokeArgs
    ): Promise<OpenKodoProfileOrgMemberMutationResult> =>
      revokeOpenKodoProfileOrgInvite(
        getProfileUserDataPath(),
        orgInviteRevokeArgsFromUnknown(rawArgs)
      )
  )

  ipcMain.handle(
    'openkodoProfiles:orgMemberChangeRole',
    async (
      _event,
      rawArgs: OpenKodoProfileOrgMemberChangeRoleArgs
    ): Promise<OpenKodoProfileOrgMemberMutationResult> =>
      changeOpenKodoProfileOrgMemberRole(
        getProfileUserDataPath(),
        orgMemberChangeRoleArgsFromUnknown(rawArgs)
      )
  )

  ipcMain.handle(
    'openkodoProfiles:orgMemberRemove',
    async (
      _event,
      rawArgs: OpenKodoProfileOrgMemberRemoveArgs
    ): Promise<OpenKodoProfileOrgMemberMutationResult> =>
      removeOpenKodoProfileOrgMember(
        getProfileUserDataPath(),
        orgMemberRemoveArgsFromUnknown(rawArgs)
      )
  )
}
