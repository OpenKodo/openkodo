import { join } from 'node:path'

export const PROFILE_STATE_DATABASE_FILE_NAME = 'profile-state.db'

export function profileStateDatabaseFile(profileDirectory: string): string {
  return join(profileDirectory, PROFILE_STATE_DATABASE_FILE_NAME)
}

export function getOpenKodoProfileDataFile(profileId: string, userDataPath: string): string {
  return join(userDataPath, 'profiles', profileId, 'openkodo-data.json')
}

export function getOpenKodoProfileStateDatabaseFile(
  profileId: string,
  userDataPath: string
): string {
  return profileStateDatabaseFile(join(userDataPath, 'profiles', profileId))
}
