/**
 * Lets a WSL distro stop once its openkodod idle-stops with nothing left to keep (R40). The desktop's
 * holder keeps the distro up; it reads this request and ends after openkodod's pid exits.
 */
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { OPENKODOD_WSL_HOLDER_RELEASE_FILENAME } from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-idle-exit'
import { writeSecureFile } from '../../../shared/secure-storage/secure-file'
import { OPENKODOD_WSL_HOST_ENV } from '../../../shared/remote-runtime/serve-supervisor/openkodod-server-launch-env'
import type { OpenkododDaemonRetirement } from '../daemon/openkodod-daemon-retirement'

export function openkododWslHolderReleasePath(userDataPath: string): string {
  return join(userDataPath, OPENKODOD_WSL_HOLDER_RELEASE_FILENAME)
}

/**
 * Only a WSL-host launch has a holder, and only a daemon that proved itself empty and left shows
 * no terminal would die with the distro. Why the launch marker: a setsid'd openkodod may lack WSL_DISTRO_NAME.
 */
export function idleStopMayReleaseWslHolder(
  env: NodeJS.ProcessEnv,
  daemon: OpenkododDaemonRetirement
): boolean {
  return env[OPENKODOD_WSL_HOST_ENV] === '1' && daemon.retirement === 'retired'
}

export function requestOpenkododWslHolderRelease(userDataPath: string, pid = process.pid): void {
  writeSecureFile(openkododWslHolderReleasePath(userDataPath), `${pid}\n`)
}

/**
 * A starting openkodod may be given work, so any earlier request no longer stands. WSL-host launches
 * only; never throws, so a locked or unwritable data root cannot fail a start or a stop.
 */
export function withdrawOpenkododWslHolderRelease(
  userDataPath: string,
  env: NodeJS.ProcessEnv = process.env
): void {
  if (env[OPENKODOD_WSL_HOST_ENV] !== '1') {
    return
  }
  try {
    rmSync(openkododWslHolderReleasePath(userDataPath), { force: true })
  } catch (error) {
    console.error('[openkodod] could not withdraw the WSL holder release request:', error)
  }
}
