import { openkododRemoteBaseDir } from '../install/openkodod-remote-windows-node'
import { randomUUID } from 'node:crypto'
import type {
  OpenkododRollbackOptions,
  OpenkododRollbackResult
} from '../install/openkodod-remote-rollback'
import { isUnconfirmedSshCommandTermination } from '../../ssh/remote-exec/remote-exec-command'
import { withRolledBackVersion } from '../activation/openkodod-activation-record'
import { writeOpenkododActivationRecord } from '../activation/openkodod-activation-record-store'
import { launchAndJudgeOpenkododSlot } from '../activation/openkodod-candidate-launch-verdict'
import { assessOpenkododRollback } from './openkodod-rollback-safety'
import { OPENKODOD_LOG_FILENAME } from '../install/openkodod-remote-host-support'
import {
  captureOpenkododStateSnapshotCommand,
  openkododRollbackRescueDirName,
  parseOpenkododSnapshotCapture,
  parseOpenkododSnapshotPresence,
  parseOpenkododSnapshotRestore,
  probeOpenkododStateSnapshotCommand,
  restoreOpenkododStateSnapshotCommand
} from '../host-state/openkodod-state-snapshot'
import {
  newestStateMtimeCommand,
  parseNewestStateMtimeSeconds
} from '../host-state/openkodod-state-newest-mtime'
import { joinRemotePath } from '../../ssh/remote-host/ssh-remote-platform'
import type { OpenkododActivationLockControl } from '../activation/openkodod-activation-lock'
import {
  rollbackStartingState,
  type OpenkododRollbackTransaction
} from '../activation/openkodod-activation-transaction'
import {
  createOpenkododRollbackTransaction,
  withOpenkododRollbackPhase,
  withOpenkododRollbackRescue
} from '../activation/openkodod-activation-transaction-transitions'
import { writeOpenkododActivationTransaction } from '../activation/openkodod-activation-transaction-store'
import { ROLLBACK_STALE_COUNT, rollbackRecountRefusal } from './openkodod-rollback-admission'
import { runFencedStop } from '../activation/openkodod-fenced-stop'
import {
  execOpenkododRemoteOr,
  withoutAbortSignal
} from '../install/openkodod-remote-runtime-control'
import { execOpenkododStateMutationOr } from '../host-state/openkodod-state-mutation-exec'
import {
  openkododSlotDir,
  resolveOpenkododSlotIdentity,
  type OpenkododSlotIdentity
} from '../activation/openkodod-recovery-slot'
import { openkododSnapshotPath } from '../activation/openkodod-incumbent-recovery'
import {
  putTransactionIncumbentBack,
  restoreAfterRejectedCandidate
} from '../activation/openkodod-transaction-incumbent'
import {
  readOpenkododRollbackBarrierTarget,
  rollbackBarrierRefusal,
  stopIncumbentBehindTerminalBarrier
} from './openkodod-rollback-terminal-barrier'
import { withOpenkododLogTail } from '../install/openkodod-remote-log-tail'
import { errorMessage } from '../../../shared/errors/error-message'

async function stateWritesSinceActivation(
  options: OpenkododRollbackOptions
): Promise<boolean | null> {
  const activatedAtSeconds = Math.floor(Date.parse(options.record.activatedAt ?? '') / 1000)
  if (!Number.isFinite(activatedAtSeconds)) {
    return null
  }
  const newest = parseNewestStateMtimeSeconds(
    await execOpenkododRemoteOr(
      options,
      newestStateMtimeCommand(
        options.host,
        options.userDataDir,
        openkododRemoteBaseDir(options.host, options.remoteHome)
      )
    )
  )
  return newest === null ? null : newest >= activatedAtSeconds
}

export async function rollbackOpenkododLocked(
  options: OpenkododRollbackOptions,
  lock: OpenkododActivationLockControl
): Promise<OpenkododRollbackResult> {
  const now = options.now ?? ((): Date => new Date())
  const snapshot = options.record.snapshot
  const presence = snapshot
    ? parseOpenkododSnapshotPresence(
        await execOpenkododRemoteOr(
          options,
          probeOpenkododStateSnapshotCommand(
            options.host,
            openkododSnapshotPath(options, snapshot.dirName),
            openkododRemoteBaseDir(options.host, options.remoteHome)
          )
        )
      )
    : 'absent'
  const safety = assessOpenkododRollback({
    record: options.record,
    snapshotPresent: presence === 'unverifiable' ? null : presence === 'present',
    census: options.census,
    targetDaemonProtocol: options.targetDaemonProtocol,
    stateWritesSinceActivation: await stateWritesSinceActivation(options)
  })
  if (safety.safety === 'unsafe') {
    return { outcome: 'refused', code: safety.code, reason: safety.reason }
  }
  if (!snapshot || !options.record.active) {
    return {
      outcome: 'refused',
      code: 'openkodod_rollback_no_active',
      reason: 'No openkodod version is active on this host, so there is nothing to roll back from.'
    }
  }
  let incumbent: OpenkododSlotIdentity
  try {
    incumbent = await resolveOpenkododSlotIdentity(options, options.record.active)
  } catch (error) {
    if (isUnconfirmedSshCommandTermination(error)) {
      throw error
    }
    return {
      outcome: 'refused',
      code: 'openkodod_rollback_active_identity_unverifiable',
      reason: `The active openkodod identity could not be verified: ${errorMessage(error)} Nothing was changed.`
    }
  }

  const barrierTarget = await readOpenkododRollbackBarrierTarget(options, incumbent.version)
  if (barrierTarget.state === 'refused') {
    return { outcome: 'refused', code: barrierTarget.code, reason: barrierTarget.reason }
  }
  const startedAt = now()
  let transaction: OpenkododRollbackTransaction = createOpenkododRollbackTransaction({
    transactionId: randomUUID(),
    incumbentVersion: incumbent.version,
    targetVersion: safety.target,
    recordBefore: options.record,
    recordAfter: withRolledBackVersion(options.record, startedAt),
    rescueDirName: openkododRollbackRescueDirName(incumbent.version, startedAt.getTime()),
    now: startedAt
  })
  const fenced = await runFencedStop({
    recountCensus: options.recountCensus,
    releaseIncumbentAdmission: options.releaseIncumbentAdmission,
    now: () => now().getTime(),
    refuse: rollbackRecountRefusal,
    prepare: () => writeOpenkododActivationTransaction(options, transaction),
    stale: () => ROLLBACK_STALE_COUNT,
    stop: async () => {
      lock.retainOnError()
      // Cancellation after mutation could strand a stopped host; finish or recover instead.
      options = withoutAbortSignal(options)
      // Pre-lock census can go stale; the fenced stop supplies the terminal-safety proof.
      return stopIncumbentBehindTerminalBarrier(
        options,
        transaction.transactionId,
        barrierTarget.context
      )
    },
    // Withdrawn stops leave the incumbent serving and needing admission reopened.
    stopMayHaveBeenSent: (barrier) => barrier.state !== 'withdrawn'
  })
  if ('refused' in fenced) {
    return fenced.refused
  }
  const blocked = rollbackBarrierRefusal(fenced.stopped)
  if (blocked) {
    if (blocked.retainFence) {
      lock.retain()
    }
    const recovered = blocked.restartIncumbent
      ? ` ${await putIncumbentBack(options, lock, transaction, incumbent)}`
      : ''
    return { outcome: blocked.outcome, code: blocked.code, reason: blocked.reason + recovered }
  }
  transaction = withOpenkododRollbackPhase(transaction, 'incumbent-stopped', now())
  await writeOpenkododActivationTransaction(options, transaction)

  const rescue = parseOpenkododSnapshotCapture(
    await execOpenkododStateMutationOr(
      options,
      captureOpenkododStateSnapshotCommand(
        options.host,
        options.userDataDir,
        openkododSnapshotPath(options, transaction.rescue.dirName),
        openkododRemoteBaseDir(options.host, options.remoteHome)
      )
    )
  )
  if (rescue === 'failed') {
    const recovered = await putIncumbentBack(options, lock, transaction, incumbent)
    return {
      outcome: 'failed',
      code: 'openkodod_rollback_rescue_snapshot_failed',
      reason:
        'The current state could not be preserved in a rescue snapshot, so the data root was ' +
        `not replaced. ${recovered}`
    }
  }
  transaction = withOpenkododRollbackRescue(transaction, rescue, now())
  await writeOpenkododActivationTransaction(options, transaction)

  // Restore before launching: older builds must never load newer state.
  const restored = parseOpenkododSnapshotRestore(
    await execOpenkododStateMutationOr(
      options,
      restoreOpenkododStateSnapshotCommand(
        options.host,
        options.userDataDir,
        openkododSnapshotPath(options, snapshot.dirName),
        openkododRemoteBaseDir(options.host, options.remoteHome)
      )
    )
  )
  if (restored !== 'restored') {
    const recovered = await putIncumbentBack(options, lock, transaction, incumbent)
    return {
      outcome: 'failed',
      code: 'openkodod_rollback_restore_failed',
      reason: `The pre-activation snapshot could not be restored (${restored}). ${recovered}`
    }
  }
  transaction = withOpenkododRollbackPhase(transaction, 'rollback-state-restored', now())
  await writeOpenkododActivationTransaction(options, transaction)

  const targetDir = openkododSlotDir(options, safety.target)
  const { verdict, launchError } = await launchAndJudgeOpenkododSlot(options, {
    remoteInstallDir: targetDir,
    fullVersion: safety.target,
    buildHash: options.targetBuildHash
  })
  if (verdict.decision === 'reject') {
    const reason =
      launchError === undefined
        ? verdict.reason
        : `It failed while starting: ${errorMessage(launchError)}`
    const recovered = await restoreAfterRejectedCandidate(options, lock, {
      launchedDir: targetDir,
      launchedVersion: safety.target,
      transactionStartedAt: transaction.startedAt,
      incumbent,
      restoreState: rescueVerdict(transaction),
      launchedFromState: rollbackStartingState(transaction)
    })
    return {
      outcome: 'failed',
      code: launchError === undefined ? verdict.code : 'openkodod_rollback_target_launch_failed',
      reason: await withOpenkododLogTail(
        options,
        targetDir,
        `The rollback target ${safety.target} did not come up healthy: ${reason} ${recovered} ` +
          `Its stderr is at ${joinRemotePath(options.host, targetDir, OPENKODOD_LOG_FILENAME)}.`
      )
    }
  }

  // Until target readiness is proven, active must still identify the recoverable incumbent.
  transaction = withOpenkododRollbackPhase(transaction, 'target-ready', now())
  await writeOpenkododActivationTransaction(options, transaction)
  await writeOpenkododActivationRecord(options, transaction.recordAfter)
  return {
    outcome: 'rolled-back',
    target: safety.target,
    discarded: safety.safety === 'lossy' ? safety.discards : [],
    verdict
  }
}

type RestoreState = Parameters<typeof putTransactionIncumbentBack>[2]['restoreState']

function rescueVerdict(transaction: OpenkododRollbackTransaction): RestoreState {
  return transaction.rescue.state === 'pending' ? null : transaction.rescue
}

async function putIncumbentBack(
  options: OpenkododRollbackOptions,
  lock: OpenkododActivationLockControl,
  transaction: OpenkododRollbackTransaction,
  incumbent: OpenkododSlotIdentity
): Promise<string> {
  const failure = await putTransactionIncumbentBack(options, lock, {
    transactionStartedAt: transaction.startedAt,
    launchedVersion: null,
    incumbent,
    restoreState: rescueVerdict(transaction)
  })
  return failure ?? `openkodod ${incumbent.version} was restored and is serving again.`
}
