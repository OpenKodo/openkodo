import type {
  CreateCloudLinkedOpenKodoProfileArgs,
  OpenKodoProfileListState
} from '../../../shared/openkodo-profiles/openkodo-profiles'
import type { ActiveOpenKodoProfileState } from '../profile-index-store'
import {
  createCloudLinkedOpenKodoProfileRecord,
  linkOpenKodoProfileToCloud
} from './profile-cloud-index'
import { readCloudSession, signInCloudSession } from '../cloud-session/profile-cloud-session-owner'
import { createDevOpenKodoCloudSession } from './profile-cloud-dev-auth'

type DevCreateProfileResult =
  | {
      status: 'created'
      list: ReturnType<typeof createCloudLinkedOpenKodoProfileRecord>
    }
  | { status: 'reconnect-required' }

type DevMutationResult =
  | {
      status: 'updated'
      list: OpenKodoProfileListState
    }
  | { status: 'reconnect-required' }

export function connectDevOpenKodoCloudProfile(
  active: ActiveOpenKodoProfileState,
  userDataPath: string
): OpenKodoProfileListState {
  const session = createDevOpenKodoCloudSession({ localProfileId: active.profile.id })
  signInCloudSession(active.profile.id, userDataPath, session)
  return linkOpenKodoProfileToCloud(active.profile.id, session.cloud, userDataPath)
}

export function createDevCloudLinkedOpenKodoProfile(
  active: ActiveOpenKodoProfileState,
  userDataPath: string,
  args: CreateCloudLinkedOpenKodoProfileArgs
): DevCreateProfileResult {
  if (readCloudSession(active.profile.id, userDataPath).status !== 'found') {
    return { status: 'reconnect-required' }
  }
  const session = createDevOpenKodoCloudSession({ orgId: args.orgId })
  const list = createCloudLinkedOpenKodoProfileRecord(
    session.cloud,
    { name: args.name },
    userDataPath
  )
  signInCloudSession(list.profile.id, userDataPath, session)
  return { status: 'created', list }
}

export function refreshDevOpenKodoCloudProfile(
  active: ActiveOpenKodoProfileState,
  userDataPath: string
): DevMutationResult {
  if (
    !active.profile.cloud ||
    readCloudSession(active.profile.id, userDataPath).status !== 'found'
  ) {
    return { status: 'reconnect-required' }
  }
  const session = createDevOpenKodoCloudSession({
    localProfileId: active.profile.id,
    cloudProfileId: active.profile.cloud.cloudProfileId,
    orgId: active.profile.cloud.activeOrgId
  })
  signInCloudSession(active.profile.id, userDataPath, session)
  return {
    status: 'updated',
    list: linkOpenKodoProfileToCloud(active.profile.id, session.cloud, userDataPath)
  }
}

export function selectDevOpenKodoCloudOrg(
  active: ActiveOpenKodoProfileState,
  userDataPath: string,
  orgId: string
): DevMutationResult {
  if (
    !active.profile.cloud ||
    readCloudSession(active.profile.id, userDataPath).status !== 'found'
  ) {
    return { status: 'reconnect-required' }
  }
  const session = createDevOpenKodoCloudSession({
    localProfileId: active.profile.id,
    cloudProfileId: active.profile.cloud.cloudProfileId,
    orgId
  })
  signInCloudSession(active.profile.id, userDataPath, session)
  return {
    status: 'updated',
    list: linkOpenKodoProfileToCloud(active.profile.id, session.cloud, userDataPath)
  }
}
