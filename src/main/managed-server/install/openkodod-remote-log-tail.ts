// Decorate logged errors with a bounded redacted host tail, never telemetry; missing host evidence preserves the original failure.
import { redactString } from '../../../shared/observability/redactor'
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import { OPENKODOD_LOG_FILENAME } from './openkodod-remote-host-support'
import { execCommand } from '../../ssh/remote-exec/remote-exec-command'
import {
  isWindowsRemoteHost,
  joinRemotePath,
  type RemoteHostPlatform
} from '../../ssh/remote-host/ssh-remote-platform'
import {
  openkododWindowsSlotOpCommand,
  readOpenkododWindowsEncodedAnswer
} from './openkodod-remote-windows-node'
import { OPENKODOD_WINDOWS_LOG_TAIL_MARKER } from '../host-state/openkodod-windows-host-script'
import type { OpenkododRemoteExecTarget } from './openkodod-remote-runtime-control'

export const OPENKODOD_LOG_TAIL_LINES = 40
export const OPENKODOD_LOG_TAIL_MAX_BYTES = 8 * 1024
// Error decoration must not add an unbounded delay.
const OPENKODOD_LOG_TAIL_TIMEOUT_MS = 10_000

export function openkododLogTailCommand(host: RemoteHostPlatform, slotDir: string): string {
  const log = joinRemotePath(host, slotDir, OPENKODOD_LOG_FILENAME)
  if (isWindowsRemoteHost(host)) {
    return openkododWindowsSlotOpCommand(host, slotDir, 'log-tail', [
      log,
      String(OPENKODOD_LOG_TAIL_MAX_BYTES)
    ])
  }
  return `tail -c ${OPENKODOD_LOG_TAIL_MAX_BYTES} ${quotePosixShell(log)} 2>/dev/null || true`
}

export function parseOpenkododLogTail(host: RemoteHostPlatform, output: string): string | null {
  const raw = isWindowsRemoteHost(host)
    ? (readOpenkododWindowsEncodedAnswer(output, OPENKODOD_WINDOWS_LOG_TAIL_MARKER) ?? '')
    : output
  const bounded = Buffer.from(raw, 'utf8').subarray(-OPENKODOD_LOG_TAIL_MAX_BYTES).toString('utf8')
  const lines = bounded.replace(/\s+$/u, '').split(/\r?\n/u).slice(-OPENKODOD_LOG_TAIL_LINES)
  const tail = redactString(lines.join('\n'))
  return tail.trim() ? tail : null
}

async function readOpenkododLogTail(
  target: OpenkododRemoteExecTarget,
  slotDir: string
): Promise<string | null> {
  try {
    // Observe cancellation failures without reusing the already-aborted request signal.
    const output = await execCommand(target.conn, openkododLogTailCommand(target.host, slotDir), {
      wrapCommand: target.host.commandDialect !== 'powershell',
      timeoutMs: OPENKODOD_LOG_TAIL_TIMEOUT_MS
    })
    return parseOpenkododLogTail(target.host, output)
  } catch (error) {
    console.warn('[ssh] Could not read the openkodod.log tail:', error)
    return null
  }
}

export async function withOpenkododLogTail(
  target: OpenkododRemoteExecTarget,
  slotDir: string,
  message: string
): Promise<string> {
  const tail = await readOpenkododLogTail(target, slotDir)
  return tail ? `${message}\nLast lines of openkodod.log:\n${tail}` : message
}
