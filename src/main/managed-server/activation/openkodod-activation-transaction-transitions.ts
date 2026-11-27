import type { OpenkododActivationRecord } from './openkodod-activation-record'
import { OPENKODOD_ACTIVATION_TRANSACTION_SCHEMA_VERSION } from './openkodod-activation-transaction-schema'
import type {
  OpenkododActivateTransaction,
  OpenkododRollbackTransaction
} from './openkodod-activation-transaction'

export function createOpenkododActivationTransaction(options: {
  transactionId: string
  candidateVersion: string
  appVersion?: string
  recordBefore: OpenkododActivationRecord
  snapshotDirName: string
  now: Date
}): OpenkododActivateTransaction {
  const timestamp = options.now.toISOString()
  return {
    schemaVersion: OPENKODOD_ACTIVATION_TRANSACTION_SCHEMA_VERSION,
    transactionId: options.transactionId,
    operation: 'activate',
    phase: 'prepared',
    startedAt: timestamp,
    updatedAt: timestamp,
    candidateVersion: options.candidateVersion,
    candidateAppVersion: options.appVersion ?? null,
    recordBefore: options.recordBefore,
    recordAfter: null,
    snapshot: { dirName: options.snapshotDirName, state: 'pending' }
  }
}

export function withOpenkododActivationIncumbentStopped(
  transaction: OpenkododActivateTransaction,
  now: Date
): OpenkododActivateTransaction {
  return {
    ...transaction,
    phase: 'incumbent-stopped',
    updatedAt: now.toISOString()
  }
}

export function withOpenkododActivationSnapshot(
  transaction: OpenkododActivateTransaction,
  state: 'captured' | 'empty',
  now: Date
): OpenkododActivateTransaction {
  return {
    ...transaction,
    phase: 'snapshot-captured',
    updatedAt: now.toISOString(),
    snapshot: { dirName: transaction.snapshot.dirName, state }
  }
}

export function withOpenkododActivationCandidateReady(
  transaction: OpenkododActivateTransaction,
  recordAfter: OpenkododActivationRecord,
  now: Date
): OpenkododActivateTransaction {
  return {
    ...transaction,
    phase: 'candidate-ready',
    updatedAt: now.toISOString(),
    recordAfter
  }
}

export function createOpenkododRollbackTransaction(options: {
  transactionId: string
  incumbentVersion: string
  targetVersion: string
  recordBefore: OpenkododActivationRecord
  recordAfter: OpenkododActivationRecord
  rescueDirName: string
  now: Date
}): OpenkododRollbackTransaction {
  const timestamp = options.now.toISOString()
  return {
    schemaVersion: OPENKODOD_ACTIVATION_TRANSACTION_SCHEMA_VERSION,
    transactionId: options.transactionId,
    operation: 'rollback',
    phase: 'prepared',
    startedAt: timestamp,
    updatedAt: timestamp,
    incumbentVersion: options.incumbentVersion,
    targetVersion: options.targetVersion,
    recordBefore: options.recordBefore,
    recordAfter: options.recordAfter,
    rescue: { dirName: options.rescueDirName, state: 'pending' }
  }
}

export function withOpenkododRollbackPhase(
  transaction: OpenkododRollbackTransaction,
  phase: 'incumbent-stopped' | 'rollback-state-restored' | 'target-ready',
  now: Date
): OpenkododRollbackTransaction {
  return { ...transaction, phase, updatedAt: now.toISOString() }
}

export function withOpenkododRollbackRescue(
  transaction: OpenkododRollbackTransaction,
  state: 'captured' | 'empty',
  now: Date
): OpenkododRollbackTransaction {
  return {
    ...transaction,
    phase: 'rescue-captured',
    updatedAt: now.toISOString(),
    rescue: { dirName: transaction.rescue.dirName, state }
  }
}
