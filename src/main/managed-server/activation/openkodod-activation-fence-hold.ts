/** Retry live fences later, clear abandoned bare fences, and require recovery for interrupted journaled state. */
import {
  openkododActivationFenceExists,
  withStaleOpenkododActivationRecoveryLock,
  type OpenkododActivationLockOptions
} from './openkodod-activation-lock'
import { readOpenkododActivationTransaction } from './openkodod-activation-transaction-store'
import { openkododActivationFenceLockDir } from './openkodod-activation-transaction'
import { isRelayInstallLockStale } from '../install/remote-install-lock'
import { findExitedOwnLockToken } from './openkodod-exited-own-lock'
import { openkododRemoteBaseDir } from '../install/openkodod-remote-windows-node'

export const OPENKODOD_ACTIVATION_FENCE_BUSY_CODE = 'openkodod_activation_fence_busy'
const OPENKODOD_ACTIVATION_RECOVERY_REQUIRED_CODE = 'openkodod_activation_recovery_required'

type OpenkododActivationFenceRefusal = {
  code: string
  reason: string
  /** Bare stale fence cleared; the caller may retry immediately. */
  cleared?: true
}

export async function openkododActivationFenceRefusal(
  options: OpenkododActivationLockOptions,
  attempt: string
): Promise<OpenkododActivationFenceRefusal> {
  const lockDir = openkododActivationFenceLockDir(options.host, options.remoteHome)
  const journal = (await readOpenkododActivationTransaction(options).catch(() => null)) !== null
  const baseDir = openkododRemoteBaseDir(options.host, options.remoteHome)
  const stale =
    (await findExitedOwnLockToken(options, lockDir, { baseDir, guardsStateMutation: true })) !==
      null || (await isRelayInstallLockStale(options.conn, lockDir, options.host))
  if (stale && !journal && (await clearAbandonedFence(options))) {
    return {
      code: OPENKODOD_ACTIVATION_FENCE_BUSY_CODE,
      reason: `An abandoned fence held this host and was cleared; the ${attempt} is retried.`,
      cleared: true
    }
  }
  const stuck =
    stale || (journal && !(await openkododActivationFenceExists(options).catch(() => true)))
  return stuck
    ? {
        code: OPENKODOD_ACTIVATION_RECOVERY_REQUIRED_CODE,
        reason: `An interrupted update or stop holds this host, so the ${attempt} did not start. Recover it first.`
      }
    : {
        code: OPENKODOD_ACTIVATION_FENCE_BUSY_CODE,
        reason: `Another run is changing this host’s OpenKodo server, so the ${attempt} did not start. It is retried on a later connect.`
      }
}

/** Drop a stale fence only after rechecking under takeover that no journal appeared. */
async function clearAbandonedFence(options: OpenkododActivationLockOptions): Promise<boolean> {
  try {
    return await withStaleOpenkododActivationRecoveryLock(options, async (lock) => {
      if (await readOpenkododActivationTransaction(options)) {
        lock.retain()
        return false
      }
      return true
    })
  } catch {
    // Failed takeover leaves the fence intact for normal refusal classification.
    return false
  }
}
