import {
  evaluateOpenkododActivation,
  type OpenkododActivationExpectation
} from './openkodod-activation-gate'
import {
  openkododLivenessProbeCommand,
  parseOpenkododLiveness,
  type OpenkododLaunchSpec,
  type OpenkododReadinessParse
} from '../install/openkodod-remote-launch'
import {
  execOpenkododRemote,
  launchOpenkododAndAwaitReadiness,
  type OpenkododRemoteExecTarget
} from '../install/openkodod-remote-runtime-control'
import {
  parseOpenkododReadinessWaitOutput,
  readOpenkododReadinessNowCommand
} from '../install/openkodod-remote-readiness-wait'
import type { ServeReadiness } from '../../server/serve-readiness'
import { withOpenkododLogTail } from '../install/openkodod-remote-log-tail'
import type { RemoteHostPlatform } from '../../ssh/remote-host/ssh-remote-platform'

type OpenkododReadinessFailureVerdict = 'exited' | 'unverifiable' | 'rejected'

export class OpenkododActiveReadinessError extends Error {
  constructor(
    readonly verdict: OpenkododReadinessFailureVerdict,
    message: string
  ) {
    super(message)
    this.name = 'OpenkododActiveReadinessError'
  }
}

/** A launched openkodod that did not publish acceptable readiness; inspection failures stay the base error. */
export class OpenkododLaunchReadinessError extends OpenkododActiveReadinessError {
  constructor(verdict: OpenkododReadinessFailureVerdict, message: string) {
    super(verdict, message)
    this.name = 'OpenkododLaunchReadinessError'
  }
}

function gatedReadiness(
  parsed: OpenkododReadinessParse,
  expectation: OpenkododActivationExpectation,
  label: string
): ServeReadiness {
  const readiness = parsed.state === 'ready' ? parsed.readiness : null
  const verdict = evaluateOpenkododActivation(readiness, expectation)
  if (verdict.decision === 'reject') {
    throw new OpenkododActiveReadinessError(
      'rejected',
      `${label} failed its readiness check: ${verdict.reason}`
    )
  }
  if (!readiness) {
    throw new OpenkododActiveReadinessError(
      'rejected',
      `${label} passed activation without a readiness payload.`
    )
  }
  const coverage = openkododDaemonCoverageRefusal(readiness)
  if (coverage) {
    throw new OpenkododActiveReadinessError('rejected', `${label} ${coverage}`)
  }
  return readiness
}

/** Require PTY self-test coverage, or handshake on platforms that cannot spawn-probe. Older slots without coverage metadata retain the identity-only gate. */
function openkododDaemonCoverageRefusal(readiness: ServeReadiness): string | null {
  const health = readiness.health
  const coverage = health?.terminalDaemon?.selfTest?.coverage
  if (!health || coverage === undefined || coverage === 'pty-spawn') {
    return null
  }
  if (coverage === 'handshake' && health.platform === 'win32') {
    return null
  }
  return (
    `reported terminal-daemon coverage '${String(coverage)}', which does not prove a PTY can ` +
    `be created on ${health.platform}.`
  )
}

export async function probeActiveOpenkododReadiness(
  target: OpenkododRemoteExecTarget & { remoteInstallDir: string },
  expectation: OpenkododActivationExpectation
): Promise<ServeReadiness> {
  assertActiveOpenkododLive(
    await execOpenkododRemote(
      target,
      openkododLivenessProbeCommand(target.host, target.remoteInstallDir)
    ),
    expectation
  )
  return activeOpenkododReadinessFromOutput(
    target.host,
    await execOpenkododRemote(
      target,
      readOpenkododReadinessNowCommand(target.host, target.remoteInstallDir)
    ),
    expectation
  )
}

/** Throws unless the liveness probe's answer proves the active slot's process is running. */
export function assertActiveOpenkododLive(
  livenessOutput: string,
  expectation: OpenkododActivationExpectation
): void {
  const liveness = parseOpenkododLiveness(livenessOutput)
  if (liveness === 'DEAD') {
    throw new OpenkododActiveReadinessError(
      'exited',
      `openkodod ${expectation.fullVersion} is recorded active but its process has exited.`
    )
  }
  if (liveness === 'NEVER_LAUNCHED') {
    throw new OpenkododActiveReadinessError(
      'exited',
      `openkodod ${expectation.fullVersion} is recorded active but was never started from its install directory.`
    )
  }
  if (liveness !== 'LIVE') {
    throw new OpenkododActiveReadinessError(
      'unverifiable',
      `openkodod ${expectation.fullVersion} process state is unverifiable.`
    )
  }
}

export function activeOpenkododReadinessFromOutput(
  host: RemoteHostPlatform,
  readinessOutput: string,
  expectation: OpenkododActivationExpectation
): ServeReadiness {
  return gatedReadiness(
    parseOpenkododReadinessWaitOutput(host, readinessOutput),
    expectation,
    'The active openkodod'
  )
}

/** Accept recovery/rollback launches only when they prove the expected build. */
export async function launchOpenkododSlotAndAwaitReadiness(
  target: OpenkododRemoteExecTarget & {
    readinessTimeoutMs?: number
    sleep?: (ms: number) => Promise<void>
  },
  spec: OpenkododLaunchSpec,
  expectation: OpenkododActivationExpectation
): Promise<ServeReadiness> {
  const parsed = await launchOpenkododAndAwaitReadiness(target, spec)
  try {
    return gatedReadiness(parsed, expectation, `openkodod ${spec.fullVersion}`)
  } catch (error) {
    if (!(error instanceof OpenkododActiveReadinessError)) {
      throw error
    }
    const message = await withOpenkododLogTail(target, spec.remoteInstallDir, error.message)
    throw new OpenkododLaunchReadinessError(error.verdict, message)
  }
}
