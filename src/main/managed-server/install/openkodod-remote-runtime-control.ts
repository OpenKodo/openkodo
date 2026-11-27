import { OPENKODOD_STARTUP_READINESS_TIMEOUT_MS } from '../../../shared/remote-runtime/openkodod-distribution/openkodod-profile-preflight'
import {
  openkododLaunchCommand,
  parseOpenkododReadinessOutput,
  type OpenkododLaunchSpec,
  type OpenkododReadinessParse
} from './openkodod-remote-launch'
import {
  hasWindowsOpenkododLaunchReport,
  readWindowsOpenkododLaunchReport,
  readWindowsOpenkododSlotRuntime,
  readWindowsOpenkododSlotEntry,
  windowsOpenkododLaunchCommand,
  windowsOpenkododLaunchRuntimeCommand
} from './openkodod-remote-launch-windows'
import {
  OPENKODOD_READINESS_WAIT_MAX_SECONDS,
  openkododLaunchExitedDuringWait,
  openkododReadinessWaitCommand,
  parseOpenkododReadinessWaitOutput
} from './openkodod-remote-readiness-wait'
import type { OpenkododHostTransport } from './openkodod-host-transport'
import { errorMessage } from '../../../shared/errors/error-message'
import {
  execCommand,
  isSshCommandExitError,
  isUnconfirmedSshCommandTermination
} from '../../ssh/remote-exec/remote-exec-command'
import {
  currentOpenkododFence,
  isOpenkododFenceLost,
  OpenkododFenceLostError,
  posixOpenkododFenceGuard
} from '../activation/openkodod-activation-fence-scope'
import { openkododWindowsHomeOpCommand } from './openkodod-remote-windows-node'
import { OPENKODOD_WINDOWS_FENCE_ARG } from '../host-state/openkodod-windows-host-fence-ops'
import {
  isWindowsRemoteHost,
  type RemoteHostPlatform
} from '../../ssh/remote-host/ssh-remote-platform'

// Pause even after early host answers to avoid a tight retry loop.
const READINESS_RETRY_PAUSE_MS = 1_000

export type OpenkododRemoteExecTarget = {
  conn: OpenkododHostTransport
  host: RemoteHostPlatform
  signal?: AbortSignal
  /** Locates the runtime store for host-record scripts; required on Windows, unused elsewhere. */
  remoteHome?: string
}

/** A held activation fence must still name this run before any host step. */
export async function execOpenkododRemote(
  target: OpenkododRemoteExecTarget,
  command: string,
  signal = target.signal
): Promise<string> {
  const fence = currentOpenkododFence()
  const run = (line: string): Promise<string> =>
    execCommand(target.conn, line, {
      wrapCommand: target.host.commandDialect !== 'powershell',
      signal
    })
  try {
    if (!fence) {
      return await run(command)
    }
    if (!isWindowsRemoteHost(target.host)) {
      return await run(`${posixOpenkododFenceGuard(fence)} ${command}`)
    }
    // Host ops check ownership internally; other commands need a preceding check.
    if (!command.includes(OPENKODOD_WINDOWS_FENCE_ARG) && target.remoteHome) {
      await run(openkododWindowsHomeOpCommand(target.host, target.remoteHome, 'fence-check', []))
    }
    return await run(command)
  } catch (error) {
    if (isUnconfirmedSshCommandTermination(error)) {
      throw error
    }
    throw isOpenkododFenceLost(error) ? new OpenkododFenceLostError() : error
  }
}

/** Only confirmed failures use fallback; unconfirmed failures and lost fences propagate. */
export function execOpenkododRemoteOr(
  target: OpenkododRemoteExecTarget,
  command: string,
  fallback = ''
): Promise<string> {
  return execOpenkododRemote(target, command).catch((error: unknown) => {
    if (isUnconfirmedSshCommandTermination(error) || error instanceof OpenkododFenceLostError) {
      throw error
    }
    return fallback
  })
}

/** Recovery paths must finish even when the request that started them was cancelled. */
export function withoutAbortSignal<T extends { signal?: AbortSignal }>(
  options: T
): Omit<T, 'signal'> {
  const { signal: _signal, ...rest } = options
  return rest
}

export async function launchOpenkododAndAwaitReadiness(
  target: OpenkododRemoteExecTarget & {
    readinessTimeoutMs?: number
    sleep?: (ms: number) => Promise<void>
  },
  spec: OpenkododLaunchSpec
): Promise<OpenkododReadinessParse> {
  if (isWindowsRemoteHost(target.host)) {
    const slotAnswer = await execOpenkododRemote(
      target,
      windowsOpenkododLaunchRuntimeCommand(target.host, spec.remoteInstallDir)
    )
    const slotRuntime = readWindowsOpenkododSlotRuntime(slotAnswer)
    const slotEntry = readWindowsOpenkododSlotEntry(slotAnswer, target.host, spec.remoteInstallDir)
    readWindowsOpenkododLaunchReport(
      await windowsLaunchReportOutput(
        target,
        windowsOpenkododLaunchCommand(target.host, spec, slotRuntime, slotEntry)
      )
    )
  } else {
    await execOpenkododRemote(
      target,
      openkododLaunchCommand(
        target.host,
        spec,
        target.conn.openkododLaunchDetach ?? 'nohup',
        (await target.conn.openkododLaunchEnv?.({ fullVersion: spec.fullVersion })) ?? []
      )
    )
  }
  const deadline =
    Date.now() + (target.readinessTimeoutMs ?? OPENKODOD_STARTUP_READINESS_TIMEOUT_MS)
  const sleep = target.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
  let last = parseOpenkododReadinessOutput('')
  let lastWaitError: unknown
  // Always read once, even if client scheduling outlasted the deadline.
  for (let first = true; first || Date.now() < deadline; first = false) {
    target.signal?.throwIfAborted()
    const waitSeconds = Math.min(
      OPENKODOD_READINESS_WAIT_MAX_SECONDS,
      Math.ceil((deadline - Date.now()) / 1000)
    )
    let output: string
    try {
      output = await execOpenkododRemote(
        target,
        openkododReadinessWaitCommand(target.host, spec.remoteInstallDir, waitSeconds)
      )
    } catch (error) {
      if (
        (error instanceof Error && error.name === 'AbortError') ||
        isUnconfirmedSshCommandTermination(error) ||
        error instanceof OpenkododFenceLostError
      ) {
        throw error
      }
      // Failed reads do not prove launch failure; stopping here could kill a healthy candidate.
      lastWaitError = error
      console.warn(`[openkodod] readiness wait failed; retrying: ${errorMessage(error)}`)
      await sleep(READINESS_RETRY_PAUSE_MS)
      continue
    }
    target.signal?.throwIfAborted()
    lastWaitError = undefined
    last = parseOpenkododReadinessWaitOutput(target.host, output)
    // An exited launch answers as the deadline would, so callers attach the same log tail.
    if (last.state !== 'pending' || openkododLaunchExitedDuringWait(target.host, output)) {
      return last
    }
    await sleep(READINESS_RETRY_PAUSE_MS)
  }
  if (lastWaitError !== undefined) {
    throw lastWaitError
  }
  return last
}

/** The launcher writes its report before exiting nonzero, so a failed launch still names its cause. */
async function windowsLaunchReportOutput(
  target: OpenkododRemoteExecTarget,
  command: string
): Promise<string> {
  try {
    return await execOpenkododRemote(target, command)
  } catch (error) {
    // Without a report the command error carries the better diagnostic.
    if (isSshCommandExitError(error) && hasWindowsOpenkododLaunchReport(error.stdout)) {
      return error.stdout
    }
    throw error
  }
}
