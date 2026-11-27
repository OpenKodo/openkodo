// Journal instance-bound stop under the activation fence; refuse live/unknown terminal census and deactivate only after proven exit.
import { randomUUID } from 'node:crypto'
import type { OpenkododActivationRecord } from '../activation/openkodod-activation-record'
import {
  readOpenkododActivationRecord,
  writeOpenkododActivationRecord
} from '../activation/openkodod-activation-record-store'
import { sameOpenkododActivationRecord } from '../activation/openkodod-activation-transaction'
import { writeOpenkododActivationTransaction } from '../activation/openkodod-activation-transaction-store'
import { withOpenkododActivationLock } from '../activation/openkodod-activation-lock'
import { openkododActivationFenceRefusal } from '../activation/openkodod-activation-fence-hold'
import {
  committedOpenkododDecommissionRecord,
  createOpenkododDecommissionTransaction,
  withOpenkododDecommissionProcessExited,
  withOpenkododDecommissionStopDispatched
} from '../lifecycle/openkodod-decommission-transaction'
import { readRemoteOpenkododManagedStopTarget } from '../lifecycle/openkodod-managed-remote-stop'
import { settleOpenkododDecommissionStop } from '../lifecycle/openkodod-decommission-stop'
import type { OpenkododSlotOptions } from '../activation/openkodod-recovery-slot'
import type { OpenkododDecommissionResult } from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-decommission'
import type { OpenkododTerminalCensus } from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-terminal-census'

type OpenkododDecommissionOptions = OpenkododSlotOptions & {
  /** Refuse if the host record changed since caller review. */
  record: OpenkododActivationRecord
  /** Fresh census must prove no live or uncounted terminals. */
  census: OpenkododTerminalCensus
  now?: () => Date
}

type Refusal = Extract<OpenkododDecommissionResult, { outcome: 'refused' }>

function refuse(verdict: Refusal['verdict'], code: string, reason: string): Refusal {
  return { outcome: 'refused', verdict, code, reason }
}

function censusRefusal(census: OpenkododTerminalCensus): Refusal | null {
  if (census.liveSessions === null) {
    return refuse(
      'unverifiable',
      'openkodod_decommission_census_unavailable',
      'The terminal daemon did not answer a session count, so decommissioning could end ' +
        'running work. Retry when the host answers.'
    )
  }
  if (census.liveSessions > 0) {
    return refuse(
      'live',
      'openkodod_decommission_terminals_running',
      `${census.liveSessions} terminal${census.liveSessions === 1 ? ' is' : 's are'} still ` +
        'running on this host. Close them before decommissioning the server.'
    )
  }
  return null
}

export async function decommissionRemoteOpenkodod(
  options: OpenkododDecommissionOptions
): Promise<OpenkododDecommissionResult> {
  const now = options.now ?? ((): Date => new Date())
  return withOpenkododActivationLock(
    options,
    async (lock) => {
      const record = await readOpenkododActivationRecord(options)
      if (!sameOpenkododActivationRecord(record, options.record)) {
        return refuse(
          'unverifiable',
          'openkodod_decommission_record_changed',
          'The host activation record changed since it was reviewed. Refresh and try again.'
        )
      }
      const activeVersion = record.active
      if (!activeVersion) {
        return refuse(
          'unverifiable',
          'openkodod_decommission_nothing_active',
          'No openkodod version is active on this host, so there is nothing to decommission.'
        )
      }
      const census = censusRefusal(options.census)
      if (census) {
        return census
      }
      const target = await readRemoteOpenkododManagedStopTarget(options, activeVersion)
      if (target.state === 'refused') {
        return refuse(target.verdict, target.code, target.reason)
      }

      let transaction = createOpenkododDecommissionTransaction({
        transactionId: randomUUID(),
        recordBefore: { ...record, active: activeVersion },
        now: now()
      })
      await writeOpenkododActivationTransaction(options, transaction)
      lock.retainOnError()
      const request = {
        schemaVersion: 1 as const,
        transactionId: transaction.transactionId,
        ...target.context,
        // Idle daemon retirement is best-effort; busy daemons retain their terminals.
        retireIdleDaemon: true as const
      }
      // Journal exact stop intent before dispatch so recovery can settle the same request.
      transaction = withOpenkododDecommissionStopDispatched(transaction, request, now())
      await writeOpenkododActivationTransaction(options, transaction)

      const settlement = await settleOpenkododDecommissionStop(options, request)
      if (settlement.state === 'withdrawn') {
        return refuse(
          settlement.verdict,
          'openkodod_decommission_stop_withdrawn',
          settlement.reason
        )
      }
      if (settlement.state === 'unsettled') {
        lock.retain()
        return refuse(
          settlement.verdict,
          'openkodod_decommission_stop_unsettled',
          settlement.reason
        )
      }
      transaction = withOpenkododDecommissionProcessExited(transaction, now())
      await writeOpenkododActivationTransaction(options, transaction)
      await writeOpenkododActivationRecord(
        options,
        committedOpenkododDecommissionRecord(transaction)
      )
      return {
        outcome: 'decommissioned',
        version: activeVersion,
        retirement: settlement.retirement
      }
    },
    async () => {
      const refusal = await openkododActivationFenceRefusal(options, 'stop')
      return refuse('unverifiable', refusal.code, refusal.reason)
    }
  )
}
