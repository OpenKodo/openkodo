import {
  evaluateOpenkododActivation,
  type OpenkododActivationVerdict
} from './openkodod-activation-gate'
import { openkododActivationTransactionRoot } from './openkodod-activation-transaction'
import type { OpenkododReadinessParse } from '../install/openkodod-remote-launch'
import {
  launchOpenkododAndAwaitReadiness,
  type OpenkododRemoteExecTarget
} from '../install/openkodod-remote-runtime-control'
import { isUnconfirmedSshCommandTermination } from '../../ssh/remote-exec/remote-exec-command'

type CandidateLaunchTarget = Parameters<typeof launchOpenkododAndAwaitReadiness>[0] &
  OpenkododRemoteExecTarget & {
    remoteHome: string
    nodePath: string
    userDataDir: string
    bindHost: string
    port: number
  }

/** Rethrow unconfirmed SSH cleanup: it provides no candidate evidence and must never mean rejection. */
export async function launchAndJudgeOpenkododSlot(
  options: CandidateLaunchTarget,
  slot: { remoteInstallDir: string; fullVersion: string; buildHash: string }
): Promise<{ verdict: OpenkododActivationVerdict; launchError: unknown }> {
  let parsed: OpenkododReadinessParse | null = null
  let launchError: unknown
  try {
    parsed = await launchOpenkododAndAwaitReadiness(options, {
      remoteInstallDir: slot.remoteInstallDir,
      nodePath: options.nodePath,
      fullVersion: slot.fullVersion,
      userDataDir: options.userDataDir,
      bindHost: options.bindHost,
      port: options.port,
      activationRoot: openkododActivationTransactionRoot(options.host, options.remoteHome)
    })
  } catch (error) {
    if (isUnconfirmedSshCommandTermination(error)) {
      throw error
    }
    launchError = error
  }
  const verdict = evaluateOpenkododActivation(parsed?.state === 'ready' ? parsed.readiness : null, {
    buildHash: slot.buildHash,
    fullVersion: slot.fullVersion
  })
  return { verdict, launchError }
}
