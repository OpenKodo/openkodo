import { uptime } from 'node:os'
import type { OpenkododUnexpectedExit } from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-unexpected-exit'
import type { OpenkododLockRecord } from '../instance-lock/openkodod-instance-lock-record'

/** A reclaimed openkodod lock from this boot means that run died; without boot evidence a reboot cannot be ruled out. */
export function reclaimedUnexpectedExit(
  holder: OpenkododLockRecord,
  self: Pick<OpenkododLockRecord, 'bootId'>,
  // Linux reads the kernel boot time; elsewhere the OS uptime gives it.
  bootStartedAtMs: number = Date.now() - uptime() * 1000
): OpenkododUnexpectedExit | null {
  const sameBoot =
    holder.bootId && self.bootId
      ? holder.bootId === self.bootId
      : Date.parse(holder.acquiredAt) >= bootStartedAtMs
  return holder.role !== 'desktop' && sameBoot
    ? { pid: holder.pid, version: holder.version, acquiredAt: holder.acquiredAt }
    : null
}

let previousUnexpectedExit: OpenkododUnexpectedExit | null = null
let runFailed = false

/** A fatal stop keeps the instance lock, so the next start reports this run as unexpected. */
export function markOpenkododRunFailed(): void {
  runFailed = true
}

export function openkododRunFailed(): boolean {
  return runFailed
}

/** Set once from the startup lock acquisition, before readiness publishes health. */
export function recordOpenkododPreviousUnexpectedExit(exit: OpenkododUnexpectedExit | null): void {
  previousUnexpectedExit = exit
}

export function openkododPreviousUnexpectedExit(): OpenkododUnexpectedExit | null {
  return previousUnexpectedExit
}
