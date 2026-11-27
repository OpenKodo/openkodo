import type {
  OpenKodoCloudSignInProgress,
  ConnectCurrentOpenKodoProfileResult,
  CreateCloudLinkedOpenKodoProfileArgs,
  CreateCloudLinkedOpenKodoProfileResult,
  CreateLocalOpenKodoProfileArgs,
  CreateLocalOpenKodoProfileResult,
  FindOpenKodoProfileProjectsByPathArgs,
  FindOpenKodoProfileProjectsByPathResult,
  OpenKodoProfileAuthStatus,
  OpenKodoProfileListResult,
  OpenKodoProfileOrgInviteRevokeArgs,
  OpenKodoProfileOrgMemberChangeRoleArgs,
  OpenKodoProfileOrgMemberInviteArgs,
  OpenKodoProfileOrgMemberMutationResult,
  OpenKodoProfileOrgMemberRemoveArgs,
  OpenKodoProfileOrgMembersListArgs,
  OpenKodoProfileOrgMembersListResult,
  RefreshCurrentOpenKodoProfileAuthResult,
  SelectOpenKodoProfileOrgArgs,
  SelectOpenKodoProfileOrgResult,
  SignOutCurrentOpenKodoProfileResult,
  SwitchOpenKodoProfileArgs,
  SwitchOpenKodoProfileResult,
  TransferOpenKodoProfileProjectArgs,
  TransferOpenKodoProfileProjectResult
} from '../../../shared/openkodo-profiles/openkodo-profiles'
import type {
  OpenKodoCloudConsoleOpenArgs,
  OpenKodoCloudConsoleOpenResult
} from '../../../shared/openkodo-cloud-console'

export type OpenKodoProfileApi = {
  list: () => Promise<OpenKodoProfileListResult>
  authStatus: () => Promise<OpenKodoProfileAuthStatus>
  /** Fires when main changed the stored auth status on its own (e.g. a revoked session). */
  onAuthStatusChanged: (callback: () => void) => () => void
  createLocal: (args?: CreateLocalOpenKodoProfileArgs) => Promise<CreateLocalOpenKodoProfileResult>
  createCloudLinked: (
    args?: CreateCloudLinkedOpenKodoProfileArgs
  ) => Promise<CreateCloudLinkedOpenKodoProfileResult>
  switchProfile: (args: SwitchOpenKodoProfileArgs) => Promise<SwitchOpenKodoProfileResult>
  transferProject: (
    args: TransferOpenKodoProfileProjectArgs
  ) => Promise<TransferOpenKodoProfileProjectResult>
  findProjectProfiles: (
    args: FindOpenKodoProfileProjectsByPathArgs
  ) => Promise<FindOpenKodoProfileProjectsByPathResult>
  connectCurrent: () => Promise<ConnectCurrentOpenKodoProfileResult>
  signInProgress: () => Promise<OpenKodoCloudSignInProgress | null>
  onSignInProgressChanged: (
    callback: (progress: OpenKodoCloudSignInProgress | null) => void
  ) => () => void
  cancelSignIn: () => Promise<void>
  refreshAuth: () => Promise<RefreshCurrentOpenKodoProfileAuthResult>
  signOutCurrent: () => Promise<SignOutCurrentOpenKodoProfileResult>
  selectOrg: (args: SelectOpenKodoProfileOrgArgs) => Promise<SelectOpenKodoProfileOrgResult>
  orgMembersList: (
    args: OpenKodoProfileOrgMembersListArgs
  ) => Promise<OpenKodoProfileOrgMembersListResult>
  orgMemberInvite: (
    args: OpenKodoProfileOrgMemberInviteArgs
  ) => Promise<OpenKodoProfileOrgMemberMutationResult>
  orgInviteRevoke: (
    args: OpenKodoProfileOrgInviteRevokeArgs
  ) => Promise<OpenKodoProfileOrgMemberMutationResult>
  orgMemberChangeRole: (
    args: OpenKodoProfileOrgMemberChangeRoleArgs
  ) => Promise<OpenKodoProfileOrgMemberMutationResult>
  orgMemberRemove: (
    args: OpenKodoProfileOrgMemberRemoveArgs
  ) => Promise<OpenKodoProfileOrgMemberMutationResult>
  /** Opens a web console page in the system browser, signed in when auth issues a ticket. */
  openCloudConsole: (args: OpenKodoCloudConsoleOpenArgs) => Promise<OpenKodoCloudConsoleOpenResult>
}
