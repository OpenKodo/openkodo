/** Resume through the original readiness gate before undoing: the candidate may already serve changed state, and stopping it could require operator consent before anything can serve again. */
import type { ServeReadiness } from '../../server/serve-readiness'
import { withActivatedVersion } from './openkodod-activation-record'
import { writeOpenkododActivationRecord } from './openkodod-activation-record-store'
import type { OpenkododActivateTransaction } from './openkodod-activation-transaction'
import { writeOpenkododActivationTransaction } from './openkodod-activation-transaction-store'
import { withOpenkododActivationCandidateReady } from './openkodod-activation-transaction-transitions'
import { OpenkododActiveReadinessError } from './openkodod-active-readiness'
import { openkododLivenessProvenExited } from '../install/openkodod-remote-launch'
import {
  OPENKODOD_RECOVERY_CHANGED_STATE_CODE,
  type OpenkododManagedRefusal
} from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-managed-runtime'
import {
  ensureOpenkododSlotServing,
  openkododSlotDir,
  resolveOpenkododSlotIdentity,
  slotLiveness
} from './openkodod-recovery-slot'
import type { OpenkododIncumbentRecoveryOptions } from './openkodod-incumbent-recovery'
import { isOpenkododLaunchFailure } from './openkodod-launch-failure'

/** Under the held fence, return null (or the candidate's launch failure) for undo; a refusal leaves the host untouched for an operator. */
export async function resumeInterruptedOpenkododCandidate(
  options: OpenkododIncumbentRecoveryOptions,
  transaction: OpenkododActivateTransaction
): Promise<ServeReadiness | OpenkododManagedRefusal | { launchFailure: Error } | null> {
  const snapshotState = transaction.snapshot.state
  const incumbent = transaction.recordBefore.active
  if (
    transaction.phase !== 'snapshot-captured' ||
    snapshotState === 'pending' ||
    // A serving incumbent holds the port and instance lock; undo keeps it.
    (incumbent !== null &&
      !openkododLivenessProvenExited(
        await slotLiveness(options, openkododSlotDir(options, incumbent))
      ))
  ) {
    return null
  }
  const candidate = await resolveOpenkododSlotIdentity(options, transaction.candidateVersion)
  const candidateLiveness = await slotLiveness(options, candidate.remoteDir)
  // Old journals lack candidate app version, so commit would drop downgrade protection; undo a possibly serving candidate only with consent.
  if (transaction.candidateAppVersion === undefined) {
    if (openkododLivenessProvenExited(candidateLiveness) || options.acceptChangedState) {
      return null
    }
    if (candidateLiveness === 'UNKNOWN') {
      throw new Error(
        `Could not tell whether openkodod ${transaction.candidateVersion} is running.`
      )
    }
    return {
      outcome: 'refused',
      verdict: 'live',
      code: OPENKODOD_RECOVERY_CHANGED_STATE_CODE,
      reason:
        `An older OpenKodo left version ${transaction.candidateVersion} running without finishing ` +
        'its update, and did not record which app started it, so it was neither committed nor ' +
        'stopped. Recover to stop it, restore the prelaunch snapshot and restart the previous ' +
        'build; what it changed is discarded.'
    }
  }
  // Undo must rule out an unprovable candidate before starting another slot.
  if (candidateLiveness === 'UNKNOWN') {
    return null
  }
  let readiness: ServeReadiness
  try {
    readiness = await ensureOpenkododSlotServing(options, candidate)
  } catch (error) {
    // Only candidate evidence permits undo; unanswered hosts retain the fence.
    if (error instanceof OpenkododActiveReadinessError && error.verdict !== 'unverifiable') {
      // Undo still follows; the failed candidate launch is a failed run all the same.
      return isOpenkododLaunchFailure(error) ? { launchFailure: error } : null
    }
    throw error
  }
  const now = new Date()
  const recordAfter = withActivatedVersion(
    transaction.recordBefore,
    transaction.candidateVersion,
    snapshotState === 'captured'
      ? {
          dirName: transaction.snapshot.dirName,
          takenBeforeVersion: transaction.candidateVersion,
          readableByVersion: incumbent,
          takenAt: transaction.startedAt
        }
      : null,
    now,
    transaction.candidateAppVersion ?? undefined
  )
  await writeOpenkododActivationTransaction(
    options,
    withOpenkododActivationCandidateReady(transaction, recordAfter, now)
  )
  await writeOpenkododActivationRecord(options, recordAfter)
  return readiness
}
