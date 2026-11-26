import { join } from 'node:path'

/** The packaged CLI command; the same name on every platform. */
export const LINUX_CLI_COMMAND_NAME = 'openkodo'

// Keep path-only callers independent of cli-installer's Electron dependency.
export function getBundledLauncherPath(
  platform: NodeJS.Platform,
  resourcesPath: string
): string | null {
  if (platform === 'darwin') {
    return join(resourcesPath, 'bin', 'openkodo')
  }
  if (platform === 'linux') {
    return join(resourcesPath, 'bin', LINUX_CLI_COMMAND_NAME)
  }
  if (platform === 'win32') {
    return join(resourcesPath, 'bin', 'openkodo.exe')
  }
  return null
}
