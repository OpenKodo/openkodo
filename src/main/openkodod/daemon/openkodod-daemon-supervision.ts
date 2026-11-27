// Detached terminal daemons must outlive openkodod; shutting them down here would kill terminals on restart.
import {
  disconnectDaemon,
  daemonOwnsFreshPersistentPtys,
  readDaemonPidRecord
} from '../../daemon/providers/lifecycle/daemon-provider-state'
import { initDaemonPtyProvider } from '../../daemon/providers/lifecycle/daemon-provider-init'
import { resolveTerminalSpawnAdmissionMode } from '../../daemon/admission/terminal-spawn-admission-mode'
import { errorMessage } from '../../../shared/errors/error-message'
import {
  OpenkododTerminalsNotDurableError,
  takeOpenkododServeSupervision
} from '../serve-startup/openkodod-serve-supervision'

const WINDOWS_DAEMON_STARTUP_TIMEOUT_MS = 30_000

type OpenkododDaemonStartup =
  | { state: 'live'; pid: number | null }
  | { state: 'degraded'; reason: string }
  | { state: 'unavailable'; reason: string }

/** Serve without a daemon only when unsupervised; never claim terminal persistence without one. */
export async function startOpenkododDaemon(
  platform: NodeJS.Platform = process.platform
): Promise<OpenkododDaemonStartup> {
  // Taken before the daemon launches so neither it nor its terminals pass it on.
  const supervised = takeOpenkododServeSupervision()
  // Daemons must survive SSH logout; macOS GUI-session retirement would kill their terminals.
  const policy = {
    macosLoginSessionWatch: false,
    // Old daemons retain old code/umask; recycle only once terminals cannot be lost.
    recycleStaleDaemonOnEveryPlatform: true,
    spawnAdmission: resolveTerminalSpawnAdmissionMode(),
    // First Windows execution of uploaded Node/conpty may exceed 10 seconds under antivirus.
    ...(platform === 'win32' ? { startupTimeoutMs: WINDOWS_DAEMON_STARTUP_TIMEOUT_MS } : {})
  }
  try {
    await initDaemonPtyProvider(undefined, policy).catch((error: unknown) => {
      // Retry a cold-start miss once: managed activation refuses daemonless candidates.
      console.warn(
        `[openkodod] The terminal daemon did not start (${errorMessage(error)}); retrying`
      )
      return initDaemonPtyProvider(undefined, policy)
    })
  } catch (error) {
    const reason = errorMessage(error)
    if (supervised) {
      throw new OpenkododTerminalsNotDurableError(reason)
    }
    console.error(
      `[openkodod] The terminal daemon did not start: ${reason}\n` +
        '[openkodod] Terminals will run in-process and WILL NOT survive an openkodod restart.'
    )
    return { state: 'unavailable', reason }
  }
  if (!daemonOwnsFreshPersistentPtys()) {
    const reason = 'daemon adopted in degraded mode; fresh terminals run on the local provider'
    console.warn(
      `[openkodod] ${reason}. Existing daemon sessions keep working, but new terminals will not ` +
        'survive an openkodod restart until the daemon is restarted.'
    )
    return { state: 'degraded', reason }
  }
  return { state: 'live', pid: readDaemonPidRecord()?.pid ?? null }
}

/** Disconnect only: shutdown would kill the daemon and its surviving PTYs. */
export async function stopOpenkododDaemon(): Promise<void> {
  await disconnectDaemon()
}
