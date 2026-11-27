/** Share openkodod's profile lock to prevent concurrent desktop/serve writers; Electron's own instance lock cannot fence plain Node. */
import { acquireOpenkododInstanceLock } from '../../openkodod/instance-lock/openkodod-instance-lock'
import type { OpenkododInstanceLock } from '../../openkodod/instance-lock/openkodod-instance-lock-hold'
import { OpenkododInstanceLockError } from '../../openkodod/instance-lock/openkodod-data-root-privacy'
import {
  writeStartupDiagnosticLine,
  type StartupDiagnosticSink
} from '../diagnostics/startup-diagnostics'

export type DesktopProfileLockResult =
  | { state: 'acquired'; lock: OpenkododInstanceLock }
  | { state: 'held'; message: string }
  /** Unrelated lock failures preserve legacy desktop startup. */
  | { state: 'unavailable' }

export function acquireDesktopProfileInstanceLock(
  userDataPath: string,
  acquire: typeof acquireOpenkododInstanceLock = acquireOpenkododInstanceLock,
  write?: StartupDiagnosticSink
): DesktopProfileLockResult {
  try {
    const lock = acquire(userDataPath, { role: 'desktop' })
    // Best effort: a lock left by a dead pid is reclaimed on the next start anyway.
    process.once('exit', () => lock.release())
    return { state: 'acquired', lock }
  } catch (error) {
    // A holder this machine cannot judge may still be running: refusing keeps one writer.
    if (
      error instanceof OpenkododInstanceLockError &&
      (error.code === 'openkodod_instance_lock_held' ||
        error.code === 'openkodod_instance_lock_holder_unverifiable')
    ) {
      writeStartupDiagnosticLine(`[single-instance] ${error.message}`, write)
      return { state: 'held', message: error.message }
    }
    // Only live or unverifiable holders block startup; unrelated acquisition errors preserve legacy behavior.
    console.warn('[single-instance] Could not take the shared profile lock:', error)
    return { state: 'unavailable' }
  }
}
