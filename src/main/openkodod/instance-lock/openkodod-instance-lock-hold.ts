// Holding the lock means re-proving it on every heartbeat, not only at acquisition.
import { dirname, relative, isAbsolute } from 'node:path'
import { statSync, unlinkSync, utimesSync } from 'node:fs'
import { startOpenkododLockHeartbeat } from './openkodod-lock-clone-machine'
import { readBoundedLockFile } from './openkodod-instance-lock-reclaim'
import {
  describeLockHolder,
  parseOpenkododInstanceLockRecord,
  type OpenkododLockRecord
} from './openkodod-instance-lock-record'
import type { OpenkododUnexpectedExit } from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-unexpected-exit'

export type OpenkododInstanceLock = {
  readonly path: string
  readonly record: OpenkododLockRecord
  readonly previousUnexpectedExit: OpenkododUnexpectedExit | null
  /** `keepUnexpectedExit` puts back the crashed run's record this lock reclaimed, so the next
   * start still reports that run; for one-shot tools that must not consume the notice. */
  release(options?: { keepUnexpectedExit?: boolean }): void
}

const ownedProfileLocks = new Map<string, OpenkododLockRecord>()

export function ownsOpenkododProfileDirectory(directory: string): boolean {
  for (const [path, record] of ownedProfileLocks) {
    const child = relative(dirname(path), directory)
    if (child.startsWith('..') || isAbsolute(child)) {
      continue
    }
    const current = parseOpenkododInstanceLockRecord(readBoundedLockFile(path) ?? '')
    if (current?.nonce === record.nonce && current.pid === process.pid) {
      return true
    }
  }
  return false
}

type OpenkododLockBeat = 'held' | 'lost' | 'unproven'

function lockIsAbsent(lockPath: string): boolean {
  try {
    return !statSync(lockPath, { throwIfNoEntry: false })
  } catch {
    // Unstattable (e.g. a Windows delete-pending file) proves nothing; the next beat retries.
    return false
  }
}

/** Re-assert ownership: a removed lock lets the next starter in, so re-publish it or yield to its new holder. */
function beatOpenkododInstanceLock(
  lockPath: string,
  record: OpenkododLockRecord,
  publish: () => boolean
): OpenkododLockBeat {
  let current = readBoundedLockFile(lockPath)
  if (current === null && lockIsAbsent(lockPath)) {
    try {
      if (publish()) {
        console.warn(
          `[openkodod] The instance lock ${lockPath} was removed while openkodod ran; restored it.`
        )
        return 'held'
      }
    } catch (error) {
      console.warn('[openkodod] could not restore the removed instance lock:', error)
      return 'unproven'
    }
    // Another starter published between the read and the restore.
    current = readBoundedLockFile(lockPath)
  }
  const holder = parseOpenkododInstanceLockRecord(current ?? '')
  if (!holder) {
    // Starters refuse unreadable records, and torn ones show up as a new holder by the next beat.
    console.warn(`[openkodod] could not read the instance lock ${lockPath} to confirm ownership`)
    return 'unproven'
  }
  if (holder.nonce !== record.nonce) {
    console.error(
      `[openkodod] ${describeLockHolder(holder)} (pid ${holder.pid}) took over the instance lock ` +
        `${lockPath}.`
    )
    return 'lost'
  }
  try {
    const now = new Date()
    utimesSync(lockPath, now, now)
  } catch (error) {
    // A stalled heartbeat lets a machine sharing this machine-id take the lock.
    console.warn('[openkodod] could not refresh the instance lock heartbeat:', error)
  }
  return 'held'
}

export function holdOpenkododInstanceLock(
  lockPath: string,
  record: OpenkododLockRecord,
  publish: () => boolean,
  {
    previousUnexpectedExit,
    restoreReclaimedRecord,
    onExclusivityLost
  }: {
    previousUnexpectedExit: OpenkododUnexpectedExit | null
    /** Republishes the reclaimed record without overwriting a successor's lock. */
    restoreReclaimedRecord?: () => void
    onExclusivityLost: () => void
  }
): OpenkododInstanceLock {
  ownedProfileLocks.set(lockPath, record)
  let released = false
  const stopHeartbeat = startOpenkododLockHeartbeat(() => {
    if (beatOpenkododInstanceLock(lockPath, record, publish) === 'lost') {
      stopHeartbeat()
      onExclusivityLost()
    }
  })
  return {
    path: lockPath,
    record,
    previousUnexpectedExit,
    release: (options) => {
      if (released) {
        return
      }
      released = true
      if (ownedProfileLocks.get(lockPath)?.nonce === record.nonce) {
        ownedProfileLocks.delete(lockPath)
      }
      stopHeartbeat()
      // Re-read ownership before unlinking so a successor’s live runtime cannot be unlocked.
      const current = parseOpenkododInstanceLockRecord(readBoundedLockFile(lockPath) ?? '')
      if (!current || current.nonce !== record.nonce) {
        return
      }
      try {
        unlinkSync(lockPath)
      } catch {
        // Dead-PID leftovers can be reclaimed on the next start.
      }
      if (options?.keepUnexpectedExit && previousUnexpectedExit) {
        restoreReclaimedRecord?.()
      }
    }
  }
}
