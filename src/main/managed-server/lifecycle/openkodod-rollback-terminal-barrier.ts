// Pre-stop census can go stale; only fenced idle-daemon retirement proves snapshot replacement safe.
import {
  readRemoteOpenkododManagedStopTarget,
  type OpenkododManagedStopTarget
} from './openkodod-managed-remote-stop'
import { settleOpenkododDecommissionStop } from './openkodod-decommission-stop'
import type { OpenkododSlotOptions } from '../activation/openkodod-recovery-slot'
import type { OpenkododManagedStopContext } from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-stop-request'

type OpenkododRollbackBarrier =
  | { state: 'retired' }
  | { state: 'withdrawn'; reason: string }
  /** Stop underway or unconfirmed; retain the fence. */
  | { state: 'unsettled'; reason: string }
  /** Exit without proof of idle terminals requires restarting the incumbent. */
  | { state: 'unproven'; reason: string }

export async function readOpenkododRollbackBarrierTarget(
  options: OpenkododSlotOptions,
  version: string
): Promise<OpenkododManagedStopTarget> {
  const target = await readRemoteOpenkododManagedStopTarget(options, version)
  return target.state === 'ready'
    ? target
    : {
        ...target,
        code: 'openkodod_rollback_terminal_barrier_unavailable',
        reason:
          `${target.reason} A rollback needs openkodod to prove no terminal runs at its stop; ` +
          'nothing was changed.'
      }
}

export async function stopIncumbentBehindTerminalBarrier(
  options: OpenkododSlotOptions,
  transactionId: string,
  context: OpenkododManagedStopContext
): Promise<OpenkododRollbackBarrier> {
  const settlement = await settleOpenkododDecommissionStop(options, {
    schemaVersion: 1,
    transactionId,
    ...context,
    retireIdleDaemon: true
  })
  if (settlement.state === 'withdrawn' || settlement.state === 'unsettled') {
    return { state: settlement.state, reason: settlement.reason }
  }
  if (settlement.retirement === 'retired') {
    return { state: 'retired' }
  }
  return {
    state: 'unproven',
    reason:
      `openkodod ${context.version} stopped, but its terminal daemon reported ` +
      `${settlement.retirement} work at the stop, so the older snapshot was not restored.`
  }
}

type OpenkododRollbackBarrierRefusal = {
  outcome: 'refused' | 'failed'
  code: string
  reason: string
  retainFence: boolean
  restartIncumbent: boolean
}

/** Only retired daemons permit replacing current state with an older snapshot. */
export function rollbackBarrierRefusal(
  barrier: OpenkododRollbackBarrier
): OpenkododRollbackBarrierRefusal | null {
  switch (barrier.state) {
    case 'retired':
      return null
    case 'withdrawn':
      return {
        outcome: 'failed',
        code: 'openkodod_rollback_stop_withdrawn',
        reason: barrier.reason,
        retainFence: false,
        restartIncumbent: false
      }
    case 'unsettled':
      return {
        outcome: 'failed',
        code: 'openkodod_rollback_stop_incomplete',
        reason: `${barrier.reason} Nothing was restored.`,
        retainFence: true,
        restartIncumbent: false
      }
    case 'unproven':
      return {
        outcome: 'refused',
        code: 'openkodod_rollback_terminals_at_stop',
        reason: barrier.reason,
        retainFence: false,
        restartIncumbent: true
      }
  }
}
