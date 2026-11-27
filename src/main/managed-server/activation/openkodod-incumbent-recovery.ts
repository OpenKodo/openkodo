/** Restore changed state only after proven slot exit and operator consent: a launched RPC server may have created terminals the stopped host cannot census, making the snapshot stale. Use the same rule for failure and crash recovery. */
import { execOpenkododStateMutation } from '../host-state/openkodod-state-mutation-exec'
import { openkododRemoteBaseDir } from '../install/openkodod-remote-windows-node'
import type { ServeReadiness } from '../../server/serve-readiness'
import { RELAY_REMOTE_DIR } from '../install/remote-install-root'
import { OPENKODOD_STATE_SNAPSHOT_DIR } from './openkodod-activation-record'
import type { OpenkododSnapshotVerdict } from './openkodod-activation-transaction'
import {
  clearOpenkododStateSnapshotMembersCommand,
  compareOpenkododStateSnapshotCommand,
  openkododSnapshotIsUnchanged,
  parseOpenkododSnapshotRestore,
  restoreOpenkododStateSnapshotCommand
} from '../host-state/openkodod-state-snapshot'
import { execOpenkododRemote } from '../install/openkodod-remote-runtime-control'
import {
  ensureOpenkododSlotServing,
  launchOpenkododSlot,
  quiesceInterruptedOpenkododSlot,
  type OpenkododSlotIdentity,
  type OpenkododSlotOptions
} from './openkodod-recovery-slot'
import { joinRemotePath } from '../../ssh/remote-host/ssh-remote-platform'
import { OPENKODOD_RECOVERY_CHANGED_STATE_CODE } from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-managed-runtime'

export type OpenkododIncumbentRecoveryOptions = OpenkododSlotOptions & {
  /** The operator accepted restoring the snapshot over state a launched build changed. */
  acceptChangedState?: boolean
}

type OpenkododIncumbentRecovery =
  | { outcome: 'restored'; readiness: ServeReadiness | null }
  | { outcome: 'refused'; verdict: 'live' | 'unverifiable'; code: string; reason: string }

export function openkododSnapshotPath(options: OpenkododSlotOptions, dirName: string): string {
  return joinRemotePath(
    options.host,
    options.remoteHome,
    RELAY_REMOTE_DIR,
    OPENKODOD_STATE_SNAPSHOT_DIR,
    dirName
  )
}

/** Unverifiable steps throw so the caller retains the fence. */
export async function recoverOpenkododIncumbent(
  options: OpenkododIncumbentRecoveryOptions,
  input: {
    transactionStartedAt: string
    launchedVersion: string | null
    incumbent: OpenkododSlotIdentity | null
    restoreState: OpenkododSnapshotVerdict | null
    /** Rollback may restore a different snapshot from the launched slot's starting state. */
    launchedFromState?: OpenkododSnapshotVerdict | null
    /** This run itself proved both slots exited, so no fresh liveness probe is needed. */
    slotsProvenExited?: boolean
  }
): Promise<OpenkododIncumbentRecovery> {
  const quiescence =
    input.slotsProvenExited || !input.restoreState
      ? 'exited'
      : await quiesceInterruptedOpenkododSlot(options, input.launchedVersion, input.incumbent)
  // With no incumbent there is no older reader to protect; the record names nothing to serve.
  if (quiescence === 'exited' && input.restoreState && input.incumbent) {
    const decision = input.launchedVersion
      ? await decideChangedStateRestore(options, input.launchedFromState ?? input.restoreState)
      : 'restore'
    if (decision !== 'restore' && decision !== 'unchanged') {
      return decision
    }
    // A launched slot that left its starting state untouched still sits on a root to replace.
    if (decision === 'restore' || input.launchedFromState) {
      await restoreState(options, input.restoreState)
    }
  }
  if (!input.incumbent) {
    return { outcome: 'restored', readiness: null }
  }
  return {
    outcome: 'restored',
    readiness: input.slotsProvenExited
      ? await launchOpenkododSlot(options, input.incumbent)
      : await ensureOpenkododSlotServing(options, input.incumbent)
  }
}

async function decideChangedStateRestore(
  options: OpenkododIncumbentRecoveryOptions,
  state: OpenkododSnapshotVerdict
): Promise<'unchanged' | 'restore' | Extract<OpenkododIncumbentRecovery, { outcome: 'refused' }>> {
  if (state.state === 'captured') {
    const snapshotDir = openkododSnapshotPath(options, state.dirName)
    // A lost read-only comparison can conservatively mean changed.
    const comparison = await execOpenkododRemote(
      options,
      compareOpenkododStateSnapshotCommand(
        options.host,
        options.userDataDir,
        snapshotDir,
        openkododRemoteBaseDir(options.host, options.remoteHome)
      )
    ).catch(() => '')
    if (openkododSnapshotIsUnchanged(comparison)) {
      return 'unchanged'
    }
  }
  if (options.acceptChangedState) {
    return 'restore'
  }
  const retained =
    state.state === 'captured' ? ` at ${openkododSnapshotPath(options, state.dirName)}` : ''
  return {
    outcome: 'refused',
    verdict: 'unverifiable',
    code: OPENKODOD_RECOVERY_CHANGED_STATE_CODE,
    reason:
      'The launched build is stopped, but it changed profile state (or the change could not be ' +
      'checked), so the previous build was not restarted against it and this host serves ' +
      'nothing. Recover to restore the prelaunch snapshot' +
      `${retained} and restart the previous build; terminals the launched build started keep ` +
      'running but drop out of the restored state.'
  }
}

async function restoreState(
  options: OpenkododSlotOptions,
  state: OpenkododSnapshotVerdict
): Promise<void> {
  if (state.state === 'pending') {
    throw new Error('The interrupted transaction has no durable snapshot verdict.')
  }
  const command =
    state.state === 'captured'
      ? restoreOpenkododStateSnapshotCommand(
          options.host,
          options.userDataDir,
          openkododSnapshotPath(options, state.dirName),
          openkododRemoteBaseDir(options.host, options.remoteHome)
        )
      : clearOpenkododStateSnapshotMembersCommand(
          options.host,
          options.userDataDir,
          openkododRemoteBaseDir(options.host, options.remoteHome)
        )
  const restored = parseOpenkododSnapshotRestore(await execOpenkododStateMutation(options, command))
  if (restored !== 'restored') {
    throw new Error(`The prelaunch state could not be restored (${restored}).`)
  }
}
