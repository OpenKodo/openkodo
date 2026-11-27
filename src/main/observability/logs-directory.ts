import { getAppEnvironment, hasAppEnvironment } from '../../shared/app-lifecycle/app-environment'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'

// Use the environment port for plain Node hosts. Keep userData/logs on macOS
// because Electron’s logs path would strand existing bundles.
function getUserDataDir(): string {
  if (hasAppEnvironment()) {
    return getAppEnvironment().getPath('userData')
  }
  const home = homedir()
  if (platform() === 'darwin') {
    return join(home, 'Library', 'Application Support', 'OpenKodo')
  }
  if (platform() === 'win32') {
    return join(process.env.APPDATA ?? home, 'OpenKodo')
  }
  return join(home, '.config', 'OpenKodo')
}

export function getLogsDirectory(): string {
  return join(getUserDataDir(), 'logs')
}

export function getTraceFilePath(): string {
  return join(getLogsDirectory(), 'main.trace.ndjson')
}

export function getOpenkododTraceFilePath(): string {
  return join(getLogsDirectory(), 'openkodod.trace.ndjson')
}

export function getDaemonLogFilePath(): string {
  return join(getLogsDirectory(), 'daemon.log')
}
