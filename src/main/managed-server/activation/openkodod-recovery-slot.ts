/** Only positive host evidence proves slot exit. Unanswered probes stay unverifiable and never authorize starting a second slot. */
import type { ServeReadiness } from '../../server/serve-readiness'
import type { OpenkododActivationExpectation } from './openkodod-activation-gate'
import { OPENKODOD_INSTALL_MODEL } from '../install/remote-install-model'
import { computeRemoteInstallDir } from '../install/remote-versioned-install'
import { readRemoteOpenkododBuildHash } from '../install/openkodod-remote-build-hash'
import {
  launchOpenkododSlotAndAwaitReadiness,
  OpenkododActiveReadinessError,
  probeActiveOpenkododReadiness
} from './openkodod-active-readiness'
import {
  openkododLivenessProbeCommand,
  openkododLivenessProvenExited,
  parseOpenkododLiveness,
  type OpenkododLiveness
} from '../install/openkodod-remote-launch'
import {
  parseOpenkododStopOutcome,
  stopOpenkododCommand,
  type OpenkododStopOutcome
} from '../install/openkodod-remote-process-control'
import {
  execOpenkododRemote,
  type OpenkododRemoteExecTarget
} from '../install/openkodod-remote-runtime-control'
import { openkododActivationTransactionRoot } from './openkodod-activation-transaction'
import {
  initialOpenkododActivationAdmissionCommand,
  parseInitialOpenkododActivationAdmission
} from './openkodod-initial-activation-admission'

export const OPENKODOD_SLOT_STOP_WAIT_SECONDS = 20

export type OpenkododSlotOptions = OpenkododRemoteExecTarget & {
  remoteHome: string
  /** Host Node for legacy slots only; a slot's own runtime marker wins. */
  nodePath: string
  userDataDir: string
  bindHost: string
  port: number
  readinessTimeoutMs?: number
  sleep?: (ms: number) => Promise<void>
}

export type OpenkododSlotIdentity = { version: string; remoteDir: string; buildHash: string }

function expectation(identity: OpenkododSlotIdentity): OpenkododActivationExpectation {
  return { buildHash: identity.buildHash, fullVersion: identity.version }
}

export function openkododSlotDir(options: OpenkododSlotOptions, version: string): string {
  return computeRemoteInstallDir(OPENKODOD_INSTALL_MODEL, options.remoteHome, version)
}

/** Hash installed bytes so readiness must prove the same build. */
export async function resolveOpenkododSlotIdentity(
  options: OpenkododSlotOptions,
  version: string
): Promise<OpenkododSlotIdentity> {
  const remoteDir = openkododSlotDir(options, version)
  return { version, remoteDir, buildHash: await readRemoteOpenkododBuildHash(options, remoteDir) }
}

export function launchOpenkododSlot(
  options: OpenkododSlotOptions,
  identity: OpenkododSlotIdentity
): Promise<ServeReadiness> {
  return launchOpenkododSlotAndAwaitReadiness(
    options,
    {
      remoteInstallDir: identity.remoteDir,
      nodePath: options.nodePath,
      fullVersion: identity.version,
      userDataDir: options.userDataDir,
      bindHost: options.bindHost,
      port: options.port,
      // Every SSH launch is client-managed, so every one may idle out and be woken on connect.
      activationRoot: openkododActivationTransactionRoot(options.host, options.remoteHome)
    },
    expectation(identity)
  )
}

/** Proves the slot serves, starting it only on proven exit. */
export async function ensureOpenkododSlotServing(
  options: OpenkododSlotOptions,
  identity: OpenkododSlotIdentity
): Promise<ServeReadiness> {
  const liveness = parseOpenkododLiveness(
    await execOpenkododRemote(
      options,
      openkododLivenessProbeCommand(options.host, identity.remoteDir)
    )
  )
  if (liveness === 'LIVE') {
    return probeActiveOpenkododReadiness(
      { ...options, remoteInstallDir: identity.remoteDir },
      expectation(identity)
    )
  }
  if (!openkododLivenessProvenExited(liveness)) {
    throw new OpenkododActiveReadinessError(
      'unverifiable',
      `openkodod ${identity.version} process state is unverifiable.`
    )
  }
  return launchOpenkododSlot(options, identity)
}

/** `justLaunched` only for a slot this run started; otherwise the readiness PID must agree. */
export async function stopOpenkododSlot(
  options: OpenkododSlotOptions,
  remoteDir: string,
  justLaunched: boolean
): Promise<OpenkododStopOutcome> {
  return parseOpenkododStopOutcome(
    await execOpenkododRemote(
      options,
      stopOpenkododCommand(
        options.host,
        remoteDir,
        justLaunched
          ? { waitSeconds: OPENKODOD_SLOT_STOP_WAIT_SECONDS, justLaunched: true }
          : { waitSeconds: OPENKODOD_SLOT_STOP_WAIT_SECONDS, nodePath: options.nodePath }
      )
    )
  )
}

type OpenkododSlotQuiescence = 'exited' | 'other-slot-serving'

/** Prove candidate exit before replacing state and rule out another running slot, unless it already serves. Missing PID files prove nothing: SSH may drop after nohup but before $! is recorded, so inspect data-root ownership. */
export async function quiesceInterruptedOpenkododSlot(
  options: OpenkododSlotOptions,
  /** `null` when nothing was launched, so only `otherSlot` needs ruling out. */
  version: string | null,
  otherSlot: OpenkododSlotIdentity | null
): Promise<OpenkododSlotQuiescence> {
  const remoteDir = version === null ? null : openkododSlotDir(options, version)
  const stopped =
    remoteDir === null ? 'already-exited' : await stopOpenkododSlot(options, remoteDir, false)
  let exited = stopped === 'stopped' || stopped === 'already-exited'
  if ((stopped === 'unknown' || stopped === 'unconfirmed') && remoteDir !== null) {
    // No verified answer, e.g. the slot died before readiness; liveness decides.
    exited = openkododLivenessProvenExited(await slotLiveness(options, remoteDir))
  }
  if (otherSlot) {
    const other = await slotLiveness(options, otherSlot.remoteDir)
    if (other === 'LIVE' && (exited || stopped === 'no-pid')) {
      // The serving slot holds the instance lock, so a PID-less launch cannot own the state.
      await probeActiveOpenkododReadiness(
        { ...options, remoteInstallDir: otherSlot.remoteDir },
        expectation(otherSlot)
      )
      return 'other-slot-serving'
    }
    if (!openkododLivenessProvenExited(other)) {
      throw new OpenkododActiveReadinessError(
        'unverifiable',
        `openkodod ${version ?? 'candidate'} (${stopped}) and ${otherSlot.version} (${other}) cannot both be ` +
          'ruled out as owners of the shared state; it was not replaced.'
      )
    }
  }
  if (!exited && stopped === 'no-pid' && remoteDir !== null) {
    const admission = parseInitialOpenkododActivationAdmission(
      await execOpenkododRemote(
        options,
        initialOpenkododActivationAdmissionCommand(
          options.host,
          options.userDataDir,
          remoteDir,
          options.nodePath
        )
      )
    )
    exited = admission.decision === 'proceed'
  }
  if (!exited) {
    throw new OpenkododActiveReadinessError(
      'unverifiable',
      `openkodod ${version ?? 'candidate'} could not be confirmed stopped (${stopped}); replacing its state would be unsafe.`
    )
  }
  return 'exited'
}

export async function slotLiveness(
  options: OpenkododSlotOptions,
  remoteDir: string
): Promise<OpenkododLiveness> {
  return parseOpenkododLiveness(
    await execOpenkododRemote(options, openkododLivenessProbeCommand(options.host, remoteDir))
  )
}
