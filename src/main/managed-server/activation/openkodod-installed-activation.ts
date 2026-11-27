/** Journal durably before mutation so interrupted deploys can finish or recover. Release the fence only once the host is provably settled on one slot. */
import { openkododRemoteBaseDir } from '../install/openkodod-remote-windows-node'
import { randomUUID } from 'node:crypto'
import type {
  OpenkododDeployOptions,
  OpenkododDeployResult
} from '../install/openkodod-remote-deploy'
import { isUnconfirmedSshCommandTermination } from '../../ssh/remote-exec/remote-exec-command'
import { withActivatedVersion, type OpenkododStateSnapshot } from './openkodod-activation-record'
import {
  readOpenkododActivationRecord,
  writeOpenkododActivationRecord
} from './openkodod-activation-record-store'
import { launchAndJudgeOpenkododSlot } from './openkodod-candidate-launch-verdict'
import { recountLostInProcessCount } from './openkodod-update-plan'
import {
  asksCandidateForLiveDaemons,
  censusForLockedRecord,
  countedLockedRecord,
  openkododUpdatePlanner,
  type OpenkododUpdatePlan
} from './openkodod-activation-census'
import { runFencedStop } from './openkodod-fenced-stop'
import { OPENKODOD_LOG_FILENAME } from '../install/openkodod-remote-host-support'
import { openkododSnapshotFailureReason } from '../host-state/openkodod-state-snapshot-space'
import {
  OPENKODOD_SNAPSHOT_SPACE_INSUFFICIENT_CODE,
  openkododSnapshotRoomRefusal,
  openkododSnapshotsRoot
} from '../host-state/openkodod-snapshot-room'
import {
  captureOpenkododStateSnapshotCommand,
  openkododSnapshotDirName,
  parseOpenkododSnapshotCapture
} from '../host-state/openkodod-state-snapshot'
import { joinRemotePath } from '../../ssh/remote-host/ssh-remote-platform'
import { computeLocalOpenkododBuildHash } from '../install/openkodod-local-build-hash'
import { preflightOpenkododCandidate } from './openkodod-candidate-preflight'
import type { OpenkododActivationLockControl } from './openkodod-activation-lock'
import type { OpenkododActivateTransaction } from './openkodod-activation-transaction'
import {
  createOpenkododActivationTransaction,
  withOpenkododActivationCandidateReady,
  withOpenkododActivationIncumbentStopped,
  withOpenkododActivationSnapshot
} from './openkodod-activation-transaction-transitions'
import { writeOpenkododActivationTransaction } from './openkodod-activation-transaction-store'
import {
  execOpenkododRemoteOr,
  withoutAbortSignal
} from '../install/openkodod-remote-runtime-control'
import { execOpenkododStateMutationOr } from '../host-state/openkodod-state-mutation-exec'
import {
  initialOpenkododActivationAdmissionCommand,
  parseInitialOpenkododActivationAdmission
} from './openkodod-initial-activation-admission'
import {
  openkododSlotDir,
  resolveOpenkododSlotIdentity,
  type OpenkododSlotIdentity
} from './openkodod-recovery-slot'
import { openkododSnapshotPath } from './openkodod-incumbent-recovery'
import {
  restartAfterSnapshotFailure,
  restoreAfterRejectedCandidate,
  stopTransactionIncumbent
} from './openkodod-transaction-incumbent'
import { withOpenkododLogTail } from '../install/openkodod-remote-log-tail'
import { openkododCandidateLaunchFailureCode } from '../../openkodod/diagnostics/openkodod-host-unavailable'
import { errorMessage } from '../../../shared/errors/error-message'

type Outcome = Extract<OpenkododDeployResult, { outcome: 'installed-not-activated' }>

export const OPENKODOD_ACTIVATION_POLICY_REFUSED_CODE = 'openkodod_activation_policy_refused'

export async function activateInstalledOpenkodod(
  options: OpenkododDeployOptions & { localOpenkododDir: string },
  fullVersion: string,
  remoteDir: string,
  lock: OpenkododActivationLockControl
): Promise<OpenkododDeployResult> {
  const now = options.now ?? ((): Date => new Date())
  const notActivated = (
    code: string,
    reason: string,
    extra: { startCheckFailed?: true; forceable?: true } = {}
  ): Outcome => ({ outcome: 'installed-not-activated', fullVersion, code, reason, ...extra })
  const deferred = (defer: Extract<OpenkododUpdatePlan, { action: 'defer' }>): Outcome =>
    notActivated(defer.code, defer.reason, defer.forceable ? { forceable: true } : {})
  const record = await readOpenkododActivationRecord(options)
  const planFor = openkododUpdatePlanner(record, fullVersion, options.force)
  const census = censusForLockedRecord(options, record)
  let plan = planFor(census)
  if (plan.action === 'noop') {
    return { outcome: 'already-active', fullVersion }
  }
  const refusal = options.admitRecord?.(record, fullVersion)
  if (refusal) {
    return notActivated(OPENKODOD_ACTIVATION_POLICY_REFUSED_CODE, refusal)
  }
  const asksCandidate = asksCandidateForLiveDaemons(census, options.force)
  if (
    plan.action === 'defer' &&
    !(asksCandidate && plan.code === 'openkodod_update_daemon_protocol_unverifiable')
  ) {
    return deferred(plan)
  }
  const preflight = await preflightOpenkododCandidate(
    { ...options, remoteInstallDir: remoteDir, fullVersion },
    asksCandidate
  )
  if ('failure' in preflight) {
    return notActivated(preflight.code, preflight.failure, { startCheckFailed: true })
  }
  const { hostDaemonProtocols } = preflight
  plan = planFor(census, hostDaemonProtocols)
  if (plan.action === 'defer') {
    return deferred(plan)
  }

  let incumbent: OpenkododSlotIdentity | null = null
  if (record.active) {
    try {
      incumbent = await resolveOpenkododSlotIdentity(options, record.active)
    } catch (error) {
      if (isUnconfirmedSshCommandTermination(error)) {
        throw error
      }
      return notActivated(
        'openkodod_incumbent_identity_unverifiable',
        `The active openkodod ${record.active} build identity could not be verified before ` +
          `stopping it: ${errorMessage(error)} Nothing was stopped.`
      )
    }
  } else {
    const admission = parseInitialOpenkododActivationAdmission(
      await execOpenkododRemoteOr(
        options,
        initialOpenkododActivationAdmissionCommand(
          options.host,
          options.userDataDir,
          remoteDir,
          options.nodePath
        )
      )
    )
    if (admission.decision === 'defer') {
      return notActivated(admission.code, admission.reason)
    }
  }

  // Scan snapshot room before recount so slow scans cannot outdate stop admission.
  const roomless = await openkododSnapshotRoomRefusal(options, record, fullVersion)
  if (roomless) {
    return notActivated(OPENKODOD_SNAPSHOT_SPACE_INSUFFICIENT_CODE, roomless)
  }

  const startedAt = now()
  let transaction: OpenkododActivateTransaction = createOpenkododActivationTransaction({
    transactionId: randomUUID(),
    candidateVersion: fullVersion,
    appVersion: options.appVersion,
    recordBefore: record,
    snapshotDirName: openkododSnapshotDirName(fullVersion, startedAt.getTime()),
    now: startedAt
  })
  const beginMutating = (): void => {
    lock.retainOnError()
    // After mutation starts, cancellation would strand a stopped host; finish or roll back.
    options = withoutAbortSignal(options)
  }
  if (incumbent) {
    // Recount immediately before stop; the initial census may predate a long upload.
    const fenced = await runFencedStop({
      recountCensus: () =>
        countedLockedRecord(options, record)
          ? options.recountCensus()
          : Promise.reject(new Error('not the incumbent this update counted')),
      releaseIncumbentAdmission: options.releaseIncumbentAdmission,
      now: () => now().getTime(),
      refuse: (recounted) => {
        const plan =
          recountLostInProcessCount(census, recounted) ?? planFor(recounted, hostDaemonProtocols)
        return plan.action === 'defer' ? deferred(plan) : null
      },
      prepare: () => writeOpenkododActivationTransaction(options, transaction),
      stale: () =>
        notActivated(
          'openkodod_update_terminal_census_unavailable',
          'The terminal count went stale before the current server could be stopped, so nothing ' +
            'was stopped. OpenKodo will try the update again.'
        ),
      stop: () => {
        beginMutating()
        return stopTransactionIncumbent(options, incumbent, lock)
      },
      stopMayHaveBeenSent: (unstopped) => unstopped === null || unstopped.stopMayBeUnderway
    })
    if ('refused' in fenced) {
      return fenced.refused
    }
    if (fenced.stopped) {
      return notActivated(
        'openkodod_outgoing_stop_incomplete',
        `${fenced.stopped.reason} No snapshot was taken and the candidate was not started. OpenKodo ` +
          'requires matching runtime readiness before signaling an incumbent and confirmed exit ' +
          'before snapshotting.'
      )
    }
  } else {
    await writeOpenkododActivationTransaction(options, transaction)
    beginMutating()
  }
  transaction = withOpenkododActivationIncumbentStopped(transaction, now())
  await writeOpenkododActivationTransaction(options, transaction)

  // Wait for confirmed exit before snapshotting; a live SQLite WAL is not a backup boundary.
  const snapshotDir = openkododSnapshotPath(options, transaction.snapshot.dirName)
  const captureOutput = await execOpenkododStateMutationOr(
    options,
    captureOpenkododStateSnapshotCommand(
      options.host,
      options.userDataDir,
      snapshotDir,
      openkododRemoteBaseDir(options.host, options.remoteHome),
      {
        snapshotsRoot: openkododSnapshotsRoot(options),
        keep: [transaction.snapshot.dirName, ...(record.snapshot ? [record.snapshot.dirName] : [])]
      }
    ),
    'FAILED'
  )
  const capture = parseOpenkododSnapshotCapture(captureOutput)
  if (capture === 'failed') {
    const reason = openkododSnapshotFailureReason(captureOutput)
    const restarted = incumbent
      ? ` The incumbent was stopped before snapshotting; ${await restartAfterSnapshotFailure(options, incumbent, lock)}`
      : ''
    throw new Error(
      `Could not snapshot ${options.userDataDir} before activating ${fullVersion}` +
        `${reason ? `: ${reason}` : ''}. OpenKodo's persisted state carries no schema version, so ` +
        'without a snapshot a rollback has no way back. Refusing to activate. Fix what stops ' +
        `the copy (often a full disk or quota on ${openkododRemoteBaseDir(options.host, options.remoteHome)}), ` +
        `then reconnect.${restarted}`
    )
  }
  const snapshot: OpenkododStateSnapshot | null =
    capture === 'captured'
      ? {
          dirName: transaction.snapshot.dirName,
          takenBeforeVersion: fullVersion,
          readableByVersion: record.active,
          takenAt: startedAt.toISOString()
        }
      : null
  transaction = withOpenkododActivationSnapshot(transaction, capture, now())
  await writeOpenkododActivationTransaction(options, transaction)

  const { verdict, launchError } = await launchAndJudgeOpenkododSlot(options, {
    remoteInstallDir: remoteDir,
    fullVersion,
    buildHash: computeLocalOpenkododBuildHash(options.localOpenkododDir)
  })
  if (verdict.decision === 'reject') {
    const [code, reason] =
      launchError === undefined
        ? [verdict.code, verdict.reason]
        : [
            openkododCandidateLaunchFailureCode(launchError),
            `The candidate failed while starting: ${errorMessage(launchError)}`
          ]
    const restored = await restoreAfterRejectedCandidate(options, lock, {
      launchedDir: openkododSlotDir(options, transaction.candidateVersion),
      launchedVersion: transaction.candidateVersion,
      transactionStartedAt: transaction.startedAt,
      incumbent,
      restoreState: transaction.snapshot
    })
    const located =
      `${reason} Candidate stderr is at ` +
      `${joinRemotePath(options.host, remoteDir, OPENKODOD_LOG_FILENAME)}. ${restored}`
    return notActivated(code, await withOpenkododLogTail(options, remoteDir, located), {
      startCheckFailed: true
    })
  }

  const recordAfter = withActivatedVersion(record, fullVersion, snapshot, now(), options.appVersion)
  transaction = withOpenkododActivationCandidateReady(transaction, recordAfter, now())
  await writeOpenkododActivationTransaction(options, transaction)
  await writeOpenkododActivationRecord(options, recordAfter)
  return { outcome: 'installed-and-activated', fullVersion, verdict }
}
