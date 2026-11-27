import type {
  FindOpenKodoProfileProjectsByPathArgs,
  FindOpenKodoProfileProjectsByPathResult
} from '../../../shared/openkodo-profiles/openkodo-profiles'
import { getOpenKodoProfileListState } from '../profile-index-store'
import { readProfileState } from '../project-transfer/profile-project-state-file'
import { repoPhysicalKey } from '../project-transfer/profile-project-worktree-identity'

function cleanOptionalString(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function findOpenKodoProfileProjectsByPath(
  args: FindOpenKodoProfileProjectsByPathArgs,
  userDataPath: string
): FindOpenKodoProfileProjectsByPathResult {
  const path = args.path.trim()
  if (!path) {
    throw new Error('invalid_openkodo_profile_project_path')
  }

  const excludeProfileId = cleanOptionalString(args.excludeProfileId)
  const candidateKey = repoPhysicalKey({
    path,
    connectionId: cleanOptionalString(args.connectionId),
    executionHostId: args.executionHostId ?? undefined
  })
  const projects: FindOpenKodoProfileProjectsByPathResult['projects'] = []

  for (const profile of getOpenKodoProfileListState(userDataPath).profiles) {
    if (profile.id === excludeProfileId) {
      continue
    }
    const state = readProfileState(profile.id, userDataPath)
    for (const repo of state.repos) {
      if (repoPhysicalKey(repo) !== candidateKey) {
        continue
      }
      projects.push({
        profileId: profile.id,
        profileName: profile.name,
        profileKind: profile.kind,
        repoId: repo.id,
        repoName: repo.displayName || repo.path
      })
    }
  }

  return { projects }
}
