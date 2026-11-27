// Only process-exited may commit; dispatched phases nest under prepared for released readers.
import {
  serializeOpenkododActivationRecord,
  withDeactivatedVersion,
  withDeactivatedVersionCommitted,
  type OpenkododActivationRecord
} from '../activation/openkodod-activation-record'
import { OPENKODOD_ACTIVATION_TRANSACTION_SCHEMA_VERSION } from '../activation/openkodod-activation-transaction-schema'
import type { OpenkododManagedStopRequest } from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-stop-request'

export type OpenkododDecommissionTransaction = {
  schemaVersion: typeof OPENKODOD_ACTIVATION_TRANSACTION_SCHEMA_VERSION
  transactionId: string
  operation: 'decommission'
  phase: 'prepared' | 'stop-dispatched' | 'process-exited'
  startedAt: string
  updatedAt: string
  activeVersion: string
  recordBefore: OpenkododActivationRecord
  recordAfter: OpenkododActivationRecord
  request: OpenkododManagedStopRequest | null
}

/** Released desktops drop this field. */
type OpenkododDecommissionDispatch = {
  phase: 'stop-dispatched' | 'process-exited'
  request: OpenkododManagedStopRequest
}

type OpenkododDecommissionJournal = Omit<OpenkododDecommissionTransaction, 'phase' | 'request'> & {
  phase: 'prepared'
  request: null
  dispatched?: OpenkododDecommissionDispatch
}

export type OpenkododDecommissionRecoveryPlan =
  | { action: 'confirm-decommissioned'; version: string; record: OpenkododActivationRecord | null }
  /** Completion or cancellation must settle a possibly delivered request. */
  | {
      action: 'resume-stop'
      request: OpenkododManagedStopRequest
      record: OpenkododActivationRecord
    }
  | { action: 'keep-serving'; version: string }

export function createOpenkododDecommissionTransaction(options: {
  transactionId: string
  recordBefore: OpenkododActivationRecord & { active: string }
  now: Date
}): OpenkododDecommissionTransaction {
  const timestamp = options.now.toISOString()
  return {
    schemaVersion: OPENKODOD_ACTIVATION_TRANSACTION_SCHEMA_VERSION,
    transactionId: options.transactionId,
    operation: 'decommission',
    phase: 'prepared',
    startedAt: timestamp,
    updatedAt: timestamp,
    activeVersion: options.recordBefore.active,
    recordBefore: options.recordBefore,
    recordAfter: withDeactivatedVersion(options.recordBefore),
    request: null
  }
}

export function withOpenkododDecommissionStopDispatched(
  transaction: OpenkododDecommissionTransaction,
  request: OpenkododManagedStopRequest,
  now: Date
): OpenkododDecommissionTransaction {
  return { ...transaction, phase: 'stop-dispatched', updatedAt: now.toISOString(), request }
}

export function withOpenkododDecommissionProcessExited(
  transaction: OpenkododDecommissionTransaction,
  now: Date
): OpenkododDecommissionTransaction {
  return { ...transaction, phase: 'process-exited', updatedAt: now.toISOString() }
}

/** Keep top-level prepared so released readers relaunch the recorded build instead of downgrading.
 * Their parser drops dispatched; their completed-stop path loses activeAppVersion protection. */
export function openkododDecommissionJournal(
  transaction: OpenkododDecommissionTransaction
): OpenkododDecommissionJournal {
  const { phase, request, ...rest } = transaction
  return phase === 'prepared' || !request
    ? { ...rest, phase: 'prepared', request: null }
    : { ...rest, phase: 'prepared', request: null, dispatched: { phase, request } }
}

export function openkododDecommissionTransactionDefect(
  transaction: OpenkododDecommissionTransaction
): string | null {
  if (transaction.recordBefore.active !== transaction.activeVersion) {
    return 'decommission version does not match recordBefore'
  }
  if (
    serializeOpenkododActivationRecord(transaction.recordAfter) !==
    serializeOpenkododActivationRecord(withDeactivatedVersion(transaction.recordBefore))
  ) {
    return 'recordAfter is not the deactivated recordBefore'
  }
  if (transaction.request && transaction.request.version !== transaction.activeVersion) {
    return 'stop request names another version'
  }
  return null
}

export function planOpenkododDecommissionRecovery(
  transaction: OpenkododDecommissionTransaction,
  committed: boolean
): OpenkododDecommissionRecoveryPlan {
  if (committed) {
    return { action: 'confirm-decommissioned', version: transaction.activeVersion, record: null }
  }
  if (transaction.phase === 'process-exited') {
    return {
      action: 'confirm-decommissioned',
      version: transaction.activeVersion,
      record: committedOpenkododDecommissionRecord(transaction)
    }
  }
  if (transaction.phase === 'stop-dispatched' && transaction.request) {
    return {
      action: 'resume-stop',
      request: transaction.request,
      record: committedOpenkododDecommissionRecord(transaction)
    }
  }
  return { action: 'keep-serving', version: transaction.activeVersion }
}

/** Preserve advisory fields alongside the journaled recordAfter. */
export function committedOpenkododDecommissionRecord(
  transaction: OpenkododDecommissionTransaction
): OpenkododActivationRecord {
  return withDeactivatedVersionCommitted(transaction.recordBefore)
}
