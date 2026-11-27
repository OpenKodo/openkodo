import { wslDistroHolderKey } from '../discovery/wsl-distro-holder-record'

const WSL_OPENKODOD_ENVIRONMENT_ID_PREFIX = 'wsl:'

/** Every registered WSL host's environment id. */
export function defaultWslOpenkododEnvironmentId(distro: string): string {
  return `${WSL_OPENKODOD_ENVIRONMENT_ID_PREFIX}${wslDistroHolderKey(distro)}`
}

/** Synchronous, for callers that only hold an environment id. */
export function isWslOpenkododEnvironmentId(environmentId: string): boolean {
  return environmentId.startsWith(WSL_OPENKODOD_ENVIRONMENT_ID_PREFIX)
}
