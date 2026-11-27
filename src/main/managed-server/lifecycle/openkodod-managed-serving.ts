// Restart only proven-stopped slots; unverifiable serving state never proves terminal exit.
import type { KnownRuntimeEnvironment } from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import type { SshTarget } from '../../../shared/remote-runtime/ssh/ssh-types'
import { openkododBoundPort } from './openkodod-managed-bound-port'
import { managedOpenkododSlot } from './openkodod-managed-runtime-context'
import { resolveOpenkododRemoteContext } from '../install/openkodod-remote-context'
import type { OpenkododHostTransport } from '../install/openkodod-host-transport'
import {
  getManagedOpenkododCrashLoopBrake,
  wakeManagedOpenkododUnlessCrashLooping
} from './openkodod-managed-crash-loop'

export type OpenkododManagedServing =
  | { state: 'serving' }
  /** Forwards must follow the restarted server's bound port. */
  | { state: 'started'; boundPort: number | null }
  | { state: 'unverifiable'; detail: string }

export type OpenkododManagedServingInput = {
  environment: KnownRuntimeEnvironment
  target: SshTarget
  connection: OpenkododHostTransport
  remotePort: number
  probe: (environment: KnownRuntimeEnvironment, timeoutMs: number) => Promise<boolean>
  answeredAt?: (environmentId: string) => number | null
}

export const MANAGED_OPENKODOD_FENCED_DETAIL =
  'An update, rollback or recovery holds this host; it was not started.'

export const MANAGED_OPENKODOD_NOT_ACTIVATED_DETAIL =
  'This host has no activated OpenKodo server to start.'

const PROBE_TIMEOUT_MS = 5_000
// Share connect/tunnel verdicts only for the same transport and port; reboots/rebinds need fresh checks.
const VERDICT_REUSE_MS = 5_000
// Recent control-socket pongs prove serving; stop/reboot/rebind closes that socket.
const LIVE_ANSWER_PROOF_MS = 20_000

type ServingTransport = {
  connection: OpenkododHostTransport
  generation: number
  remotePort: number
}
// Reconnected transports need fresh checks instead of inheriting dropped-connection failures.
type ServingCheck = ServingTransport & {
  check: Promise<OpenkododManagedServing>
  settledAt?: number
}
const checks = new Map<string, ServingCheck>()

function sameTransport(a: ServingTransport, b: ServingTransport): boolean {
  return (
    a.connection === b.connection && a.generation === b.generation && a.remotePort === b.remotePort
  )
}
export type ManagedOpenkododStartListener = {
  starting: (target: SshTarget) => void
  /** Unverifiable results include the reason and log tail. */
  settled: (target: SshTarget, environmentId: string, serving: OpenkododManagedServing) => void
}

let startListener: ManagedOpenkododStartListener | null = null

export function setManagedOpenkododStartListener(
  listener: ManagedOpenkododStartListener | null
): void {
  startListener = listener
}

export function ensureManagedOpenkododServing(
  input: OpenkododManagedServingInput,
  now: () => number = Date.now
): Promise<OpenkododManagedServing> {
  const id = input.environment.id
  const transport: ServingTransport = {
    connection: input.connection,
    generation: input.connection.getConnectGeneration(),
    remotePort: input.remotePort
  }
  const entry = checks.get(id)
  if (
    entry &&
    sameTransport(entry, transport) &&
    (entry.settledAt === undefined || now() - entry.settledAt < VERDICT_REUSE_MS)
  ) {
    return entry.check
  }
  const answeredAt = input.answeredAt?.(id) ?? null
  const answerAge = answeredAt === null ? null : now() - answeredAt
  // Clock rollback must not extend the proof window.
  if (
    answeredAt !== null &&
    answerAge !== null &&
    answerAge >= 0 &&
    answerAge < LIVE_ANSWER_PROOF_MS
  ) {
    getManagedOpenkododCrashLoopBrake().noteServing(id, answeredAt)
    return Promise.resolve({ state: 'serving' })
  }
  const next: ServingCheck = { ...transport, check: checkAndStart(input) }
  checks.set(id, next)
  void next.check.then(
    () => {
      next.settledAt = now()
    },
    () => {
      next.settledAt = -Infinity
    }
  )
  return next.check
}

/** An explicit Connect must not reuse a cached verdict from before it. */
export function forgetManagedOpenkododServingVerdict(environmentId: string): void {
  checks.delete(environmentId)
}

async function checkAndStart(
  input: OpenkododManagedServingInput
): Promise<OpenkododManagedServing> {
  if (await input.probe(input.environment, PROBE_TIMEOUT_MS)) {
    getManagedOpenkododCrashLoopBrake().noteServing(input.environment.id)
    return { state: 'serving' }
  }
  let starting = false
  // Braked hosts publish why they were not started.
  const braked = getManagedOpenkododCrashLoopBrake().engaged(input.environment.id)
  const serving = await wakeIfStopped(input, () => {
    starting = true
    startListener?.starting(input.target)
  })
  if (starting || braked) {
    startListener?.settled(input.target, input.environment.id, serving)
  }
  return serving
}

async function wakeIfStopped(
  input: OpenkododManagedServingInput,
  onStarting: () => void
): Promise<OpenkododManagedServing> {
  const label = input.target.label
  try {
    const context = await resolveOpenkododRemoteContext(input.target, input.connection)
    const wake = await wakeManagedOpenkododUnlessCrashLooping(
      input.environment.id,
      label,
      managedOpenkododSlot(context, input.remotePort),
      onStarting
    )
    if (wake.outcome === 'crash-loop') {
      return { state: 'unverifiable', detail: wake.detail }
    }
    if (wake.outcome === 'started') {
      const idle = wake.readiness.health?.previousIdleStop
      const cause = idle
        ? `it had stopped after idling at ${idle.stoppedAt}`
        : 'it had stopped without an idle-stop record (crash, signal or host restart)'
      console.info(`[ssh] Started the managed OpenKodo server on ${label}; ${cause}.`)
      return { state: 'started', boundPort: openkododBoundPort(wake.readiness) }
    }
    // A live unanswered process may still be starting; never restart it.
    if (wake.outcome === 'serving') {
      // A live PID alone does not prove the server answers.
      if (await input.probe(input.environment, PROBE_TIMEOUT_MS)) {
        getManagedOpenkododCrashLoopBrake().noteServing(input.environment.id)
        return { state: 'serving' }
      }
      const detail = 'This host’s OpenKodo server process is live but is not answering.'
      console.warn(`[ssh] The managed OpenKodo server on ${label} is not answering: ${detail}`)
      return { state: 'unverifiable', detail }
    }
    const detail = wake.outcome === 'recovery-refused' ? wake.reason : wakeRefusal(wake.outcome)
    console.warn(`[ssh] The managed OpenKodo server on ${label} is not answering: ${detail}`)
    return { state: 'unverifiable', detail }
  } catch (error) {
    console.warn(`[ssh] Could not start the managed OpenKodo server on ${label}:`, error)
    return { state: 'unverifiable', detail: error instanceof Error ? error.message : String(error) }
  }
}

function wakeRefusal(outcome: 'not-activated' | 'unverifiable' | 'fenced'): string {
  switch (outcome) {
    case 'fenced':
      return MANAGED_OPENKODOD_FENCED_DETAIL
    case 'not-activated':
      return MANAGED_OPENKODOD_NOT_ACTIVATED_DETAIL
    case 'unverifiable':
      return 'Whether the server process is still running could not be proven, so it was not started.'
  }
}
