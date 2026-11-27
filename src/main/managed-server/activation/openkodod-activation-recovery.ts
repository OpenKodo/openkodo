// Reconcile interrupted transactions to the recorded slot and state; retain the fence whenever ownership remains unproven.
import type { ServeReadiness } from '../../server/serve-readiness'
import {
  planOpenkododTransactionRecovery,
  type OpenkododActivationTransaction
} from './openkodod-activation-transaction'
import { readOpenkododActivationTransaction } from './openkodod-activation-transaction-store'
import {
  readOpenkododActivationRecord,
  writeOpenkododActivationRecord
} from './openkodod-activation-record-store'
import {
  openkododActivationFenceExists,
  withStaleOpenkododActivationRecoveryLock
} from './openkodod-activation-lock'
import { RemoteInstallLockBusyError } from '../install/remote-install-lock'
import { ensureOpenkododSlotServing, resolveOpenkododSlotIdentity } from './openkodod-recovery-slot'
import { reconcileOpenkododDecommission } from '../lifecycle/openkodod-decommission-recovery'
import {
  recoverOpenkododIncumbent,
  type OpenkododIncumbentRecoveryOptions
} from './openkodod-incumbent-recovery'
import type { OpenkododManagedRefusal } from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-managed-runtime'
import { resumeInterruptedOpenkododCandidate } from './openkodod-interrupted-candidate-resume'
import { errorMessage } from '../../../shared/errors/error-message'
import { isOpenkododLaunchFailure } from './openkodod-launch-failure'

export type OpenkododActivationRecoveryResult =
  | { outcome: 'none' }
  | { outcome: 'pending'; code: string; reason: string }
  | {
      outcome: 'recovered'
      resolution: 'committed' | 'restored-incumbent'
      activeVersion: string | null
      readiness: ServeReadiness | null
    }
  /** A launch failure behind an unverifiable refusal still ended a run. */
  | (OpenkododManagedRefusal & { launchFailure?: Error })

type OpenkododActivationRecoveryOptions = OpenkododIncumbentRecoveryOptions

export const OPENKODOD_RECOVERY_UNVERIFIABLE_CODE = 'openkodod_recovery_unverifiable'

/** Both pre-fence answers, read moments ago on this connect; they only skip the same two reads. */
export type OpenkododActivationIdlePreRead = { transactionAbsent: boolean; fenceOpen: boolean }

export async function recoverInterruptedOpenkododActivation(
  options: OpenkododActivationRecoveryOptions,
  preRead?: OpenkododActivationIdlePreRead
): Promise<OpenkododActivationRecoveryResult> {
  if (preRead?.transactionAbsent && preRead.fenceOpen) {
    return { outcome: 'none' }
  }
  try {
    if (
      !(await readOpenkododActivationTransaction(options)) &&
      !(await openkododActivationFenceExists(options))
    ) {
      return { outcome: 'none' }
    }
    return await withStaleOpenkododActivationRecoveryLock(options, async (lock) => {
      const transaction = await readOpenkododActivationTransaction(options)
      if (!transaction) {
        // Interrupted release can remove the journal before the fence; finishing release is enough.
        return { outcome: 'none' }
      }
      const result = await reconcileOpenkododTransaction(options, transaction)
      if (result.outcome !== 'recovered') {
        lock.retain()
      }
      return result
    })
  } catch (error) {
    if (error instanceof RemoteInstallLockBusyError) {
      return {
        outcome: 'pending',
        code: 'openkodod_recovery_transaction_still_fresh',
        reason:
          'The activation fence is held by a run that may still be working. Retry after the ' +
          'install lock recovery window.'
      }
    }
    return {
      outcome: 'refused',
      verdict: 'unverifiable',
      code: OPENKODOD_RECOVERY_UNVERIFIABLE_CODE,
      reason:
        `The interrupted activation could not be reconciled safely: ${errorMessage(error)} ` +
        'The host remains fenced.',
      ...(isOpenkododLaunchFailure(error) ? { launchFailure: error } : {})
    }
  }
}

/** Requires a held fence; unverifiable steps throw to preserve it. */
async function reconcileOpenkododTransaction(
  options: OpenkododActivationRecoveryOptions,
  transaction: OpenkododActivationTransaction
): Promise<OpenkododActivationRecoveryResult> {
  const plan = planOpenkododTransactionRecovery(
    transaction,
    await readOpenkododActivationRecord(options)
  )
  if (plan.action === 'refuse') {
    return { outcome: 'refused', verdict: 'unverifiable', code: plan.code, reason: plan.reason }
  }
  if (
    plan.action === 'confirm-decommissioned' ||
    plan.action === 'resume-stop' ||
    plan.action === 'keep-serving'
  ) {
    return reconcileOpenkododDecommission(options, plan)
  }
  if (plan.action === 'finish-commit') {
    await writeOpenkododActivationRecord(options, plan.record)
  }
  if (plan.action === 'stabilize-committed' || plan.action === 'finish-commit') {
    const activeVersion = plan.action === 'finish-commit' ? plan.record.active : plan.activeVersion
    if (!activeVersion) {
      throw new Error('The committed activation record has no active version.')
    }
    const identity = await resolveOpenkododSlotIdentity(options, activeVersion)
    return {
      outcome: 'recovered',
      resolution: 'committed',
      activeVersion,
      readiness: await ensureOpenkododSlotServing(options, identity)
    }
  }
  let launchFailure: Error | undefined
  if (transaction.operation === 'activate' && plan.launchedVersion) {
    const readiness = await resumeInterruptedOpenkododCandidate(options, transaction)
    if (readiness && 'outcome' in readiness) {
      return readiness
    }
    if (readiness && 'launchFailure' in readiness) {
      launchFailure = readiness.launchFailure
    } else if (readiness) {
      return {
        outcome: 'recovered',
        resolution: 'committed',
        activeVersion: transaction.candidateVersion,
        readiness
      }
    }
  }
  const recovery = await recoverOpenkododIncumbent(options, {
    transactionStartedAt: transaction.startedAt,
    launchedVersion: plan.launchedVersion,
    incumbent: plan.activeVersion
      ? await resolveOpenkododSlotIdentity(options, plan.activeVersion)
      : null,
    restoreState: plan.restoreState,
    launchedFromState: plan.launchedFromState
  })
  return recovery.outcome === 'refused'
    ? { ...recovery, ...(launchFailure ? { launchFailure } : {}) }
    : {
        outcome: 'recovered',
        resolution: 'restored-incumbent',
        activeVersion: plan.activeVersion,
        readiness: recovery.readiness
      }
}
