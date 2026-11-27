// Wait on-host in one bounded exec; repeated SSH polling spawned process bursts and triggered Windows EDR.
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import {
  isWindowsRemoteHost,
  joinRemotePath,
  type RemoteHostPlatform
} from '../../ssh/remote-host/ssh-remote-platform'
import {
  OPENKODOD_PID_FILENAME,
  OPENKODOD_PID_MACHINE_FILENAME,
  OPENKODOD_READINESS_FILENAME,
  OPENKODOD_READINESS_MAX_BYTES,
  OPENKODOD_LAUNCH_MACHINE_COMMAND,
  POSIX_NO_SUCH_PROCESS_CASE
} from './openkodod-remote-host-support'
import {
  parseOpenkododReadinessOutput,
  readOpenkododReadinessCommand,
  type OpenkododReadinessParse
} from './openkodod-remote-launch'
import {
  openkododWindowsSlotOpCommand,
  readOpenkododWindowsEncodedAnswer
} from './openkodod-remote-windows-node'
import { OPENKODOD_WINDOWS_READINESS_MARKER } from '../host-state/openkodod-windows-host-script'

// Stay below the 30-second exec timeout so waits can answer before channel expiry.
export const OPENKODOD_READINESS_WAIT_MAX_SECONDS = 20

const OPENKODOD_LAUNCH_EXITED_MARKER = 'OPENKODOD_LAUNCH_EXITED'

function posixReadinessWaitCommand(
  host: RemoteHostPlatform,
  remoteInstallDir: string,
  waitSeconds: number
): string {
  const file = quotePosixShell(joinRemotePath(host, remoteInstallDir, OPENKODOD_READINESS_FILENAME))
  const read = `head -c ${OPENKODOD_READINESS_MAX_BYTES + 1} ${file} 2>/dev/null`
  const pidFile = quotePosixShell(joinRemotePath(host, remoteInstallDir, OPENKODOD_PID_FILENAME))
  const pidMachine = quotePosixShell(
    joinRemotePath(host, remoteInstallDir, OPENKODOD_PID_MACHINE_FILENAME)
  )
  return [
    // Fail early only on proven exit from the launching machine; shared homes and unverified PIDs must keep waiting.
    `openkodod_launch_here() { openkodod_recorded=$(cat ${pidMachine} 2>/dev/null) && [ -n "$openkodod_recorded" ] && [ "$openkodod_recorded" = "$(${OPENKODOD_LAUNCH_MACHINE_COMMAND} 2>/dev/null)" ]; };`,
    `openkodod_launch_exited() { openkodod_launch_here || return 1; pid=$(cat ${pidFile} 2>/dev/null); case "$pid" in "" | *[!0-9]*) return 1;; esac;`,
    `probe_error=$(LC_ALL=C kill -0 "$pid" 2>&1) || { case "$probe_error" in ${POSIX_NO_SUCH_PROCESS_CASE}) return 0;; esac; return 1; };`,
    'case "$(ps -o stat= -p "$pid" 2>/dev/null)" in Z*) return 0;; esac; return 1; };',
    // Probe fractional sleep once; POSIX hosts may support only integer seconds.
    'if sleep 0.05 2>/dev/null; then openkodod_readiness_wait_step=0.05; openkodod_readiness_full_every=5;',
    'else openkodod_readiness_wait_step=1; openkodod_readiness_full_every=1; fi;',
    // Bound elapsed time, not iterations: slow filesystem reads otherwise overrun the client exec deadline.
    `openkodod_readiness_wait_end=$(($(date +%s) + ${waitSeconds})); openkodod_readiness_polls=0;`,
    // Between full checks (every 0.25 s) only a builtin test watches for the file, so polling spawns nothing.
    `while :; do if [ -s ${file} ] || [ $((openkodod_readiness_polls % openkodod_readiness_full_every)) -eq 0 ]; then`,
    '[ "$(date +%s)" -lt "$openkodod_readiness_wait_end" ] || break;',
    `[ "$(${read} | wc -l)" -gt 0 ] && break;`,
    `[ "$(${read} | wc -c)" -gt ${OPENKODOD_READINESS_MAX_BYTES} ] && break;`,
    `openkodod_launch_exited && { echo ${OPENKODOD_LAUNCH_EXITED_MARKER}; break; };`,
    'fi; openkodod_readiness_polls=$((openkodod_readiness_polls + 1)); sleep "$openkodod_readiness_wait_step"; done;',
    `${read} || true`
  ].join(' ')
}

export function openkododReadinessWaitCommand(
  host: RemoteHostPlatform,
  remoteInstallDir: string,
  waitSeconds: number
): string {
  const seconds = Math.max(
    0,
    Math.min(OPENKODOD_READINESS_WAIT_MAX_SECONDS, Math.ceil(waitSeconds))
  )
  if (!isWindowsRemoteHost(host)) {
    return posixReadinessWaitCommand(host, remoteInstallDir, seconds)
  }
  return openkododWindowsSlotOpCommand(host, remoteInstallDir, 'readiness-wait', [
    joinRemotePath(host, remoteInstallDir, OPENKODOD_READINESS_FILENAME),
    String(OPENKODOD_READINESS_MAX_BYTES),
    String(seconds)
  ])
}

export function parseOpenkododReadinessWaitOutput(
  host: RemoteHostPlatform,
  output: string
): OpenkododReadinessParse {
  return parseOpenkododReadinessOutput(
    isWindowsRemoteHost(host)
      ? (readOpenkododWindowsEncodedAnswer(output, OPENKODOD_WINDOWS_READINESS_MARKER) ?? '')
      : withoutLaunchExitedMarker(output)
  )
}

export function openkododLaunchExitedDuringWait(host: RemoteHostPlatform, output: string): boolean {
  return !isWindowsRemoteHost(host) && output.startsWith(`${OPENKODOD_LAUNCH_EXITED_MARKER}\n`)
}

function withoutLaunchExitedMarker(output: string): string {
  return output.startsWith(`${OPENKODOD_LAUNCH_EXITED_MARKER}\n`)
    ? output.slice(OPENKODOD_LAUNCH_EXITED_MARKER.length + 1)
    : output
}

export function readOpenkododReadinessNowCommand(
  host: RemoteHostPlatform,
  remoteInstallDir: string
): string {
  // Windows host wait with zero delay substitutes for the unavailable head command.
  return isWindowsRemoteHost(host)
    ? openkododReadinessWaitCommand(host, remoteInstallDir, 0)
    : readOpenkododReadinessCommand(host, remoteInstallDir)
}
