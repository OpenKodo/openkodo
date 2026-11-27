import type { OpenkododActivationLockControl } from './openkodod-activation-lock'
import type { OpenkododSnapshotVerdict } from './openkodod-activation-transaction'
import { openkododStopFreedTheHost } from '../install/openkodod-remote-process-control'
import { withoutAbortSignal } from '../install/openkodod-remote-runtime-control'
import {
  launchOpenkododSlot,
  stopOpenkododSlot,
  OPENKODOD_SLOT_STOP_WAIT_SECONDS,
  type OpenkododSlotIdentity,
  type OpenkododSlotOptions
} from './openkodod-recovery-slot'
import { recoverOpenkododIncumbent } from './openkodod-incumbent-recovery'
import { errorMessage } from '../../../shared/errors/error-message'

/** Return null on proven exit; otherwise retain the fence when a delivered stop may still change the host. */
export async function stopTransactionIncumbent(
  options: OpenkododSlotOptions,
  incumbent: OpenkododSlotIdentity,
  lock: OpenkododActivationLockControl
): Promise<{ reason: string; stopMayBeUnderway: boolean } | null> {
  const stopped = await stopOpenkododSlot(options, incumbent.remoteDir, false)
  if (openkododStopFreedTheHost(stopped)) {
    return null
  }
  // Only a stop that may have been delivered can still change the host; otherwise nothing happened.
  const stopMayBeUnderway = stopped === 'still-running' || stopped === 'unconfirmed'
  if (stopMayBeUnderway) {
    lock.retain()
  }
  return {
    reason:
      `Could not verify that openkodod ${incumbent.version} exited within ` +
      `${OPENKODOD_SLOT_STOP_WAIT_SECONDS}s (${stopped}).`,
    stopMayBeUnderway
  }
}

export async function restartAfterSnapshotFailure(
  options: OpenkododSlotOptions,
  incumbent: OpenkododSlotIdentity,
  lock: OpenkododActivationLockControl
): Promise<string> {
  try {
    await launchOpenkododSlot(withoutAbortSignal(options), incumbent)
    lock.recovered()
    return `openkodod ${incumbent.version} was restarted and is serving again.`
  } catch (error) {
    lock.retain()
    return `restarting openkodod ${incumbent.version} failed: ${errorMessage(error)} This host requires recovery.`
  }
}

/** Restore changed state and incumbent only after both slots prove exit; refusal retains the fence. */
export async function putTransactionIncumbentBack(
  options: OpenkododSlotOptions,
  lock: OpenkododActivationLockControl,
  input: {
    transactionStartedAt: string
    launchedVersion: string | null
    incumbent: OpenkododSlotIdentity | null
    restoreState: OpenkododSnapshotVerdict | null
    launchedFromState?: OpenkododSnapshotVerdict | null
  }
): Promise<string | null> {
  try {
    const recovery = await recoverOpenkododIncumbent(withoutAbortSignal(options), {
      ...input,
      slotsProvenExited: true
    })
    if (recovery.outcome === 'refused') {
      lock.retain()
      return recovery.reason
    }
    lock.recovered()
    return null
  } catch (error) {
    lock.retain()
    return `Restoring the previous version failed: ${errorMessage(error)} This host requires recovery.`
  }
}

/** Stop the rejected candidate before safely restoring incumbent state. */
export async function restoreAfterRejectedCandidate(
  options: OpenkododSlotOptions,
  lock: OpenkododActivationLockControl,
  input: {
    launchedDir: string
    launchedVersion: string
    transactionStartedAt: string
    incumbent: OpenkododSlotIdentity | null
    restoreState: OpenkododSnapshotVerdict | null
    launchedFromState?: OpenkododSnapshotVerdict | null
  }
): Promise<string> {
  const { launchedDir, ...restore } = input
  const stopped = await stopOpenkododSlot(withoutAbortSignal(options), launchedDir, true).catch(
    (error: unknown) => `unverifiable: ${errorMessage(error)}`
  )
  if (stopped !== 'stopped' && stopped !== 'already-exited') {
    lock.retain()
    return (
      `openkodod ${input.launchedVersion} could not be confirmed stopped (${stopped}), so nothing ` +
      'was restored over state it may still own. This host requires recovery.'
    )
  }
  const failure = await putTransactionIncumbentBack(options, lock, restore)
  return (
    failure ??
    (input.incumbent
      ? `openkodod ${input.incumbent.version} was restarted and is serving again.`
      : 'No previous version was active, so this host is now serving nothing.')
  )
}
