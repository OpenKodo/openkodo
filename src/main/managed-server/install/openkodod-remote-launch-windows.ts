// Win32-OpenSSH kills session jobs; require native breakaway without WMI/PowerShell, then record PID plus creation time.
import {
  OPENKODOD_WINDOWS_BREAKAWAY_CONTRACT,
  parseWindowsBreakawayLaunchReport,
  WINDOWS_BREAKAWAY_ENV_FLAG,
  WINDOWS_BREAKAWAY_LAUNCH_FLAG,
  WINDOWS_BREAKAWAY_PROCESS_FILE_FLAG,
  WINDOWS_BREAKAWAY_STDERR_FLAG,
  WINDOWS_BREAKAWAY_STDERR_KEEP_PREVIOUS_FLAG,
  WINDOWS_BREAKAWAY_STDOUT_FLAG
} from '../../../shared/remote-runtime/openkodod-lifecycle/windows-breakaway-launch'
import { joinRemotePath, type RemoteHostPlatform } from '../../ssh/remote-host/ssh-remote-platform'
import {
  openkododWindowsNodeCommandLine,
  openkododWindowsSlotOpCommand,
  readOpenkododWindowsEncodedAnswer
} from './openkodod-remote-windows-node'
import {
  OPENKODOD_WINDOWS_ENTRY_MARKER,
  OPENKODOD_WINDOWS_RUNTIME_MARKER
} from '../host-state/openkodod-windows-host-script'
import {
  OPENKODOD_LOG_FILENAME,
  OPENKODOD_READINESS_FILENAME,
  OPENKODOD_WINDOWS_PROCESS_FILENAME
} from './openkodod-remote-host-support'
import { openkododManagedLaunchEnv, type OpenkododLaunchSpec } from './openkodod-remote-launch'
import { OPENKODOD_WINDOWS_LAUNCH_REFUSED_CODE } from '../../openkodod/diagnostics/openkodod-host-unavailable'

export class OpenkododWindowsLaunchRefusedError extends Error {
  readonly code = OPENKODOD_WINDOWS_LAUNCH_REFUSED_CODE
  constructor(reason: string) {
    super(
      `The Windows host refused to start openkodod outside the SSH session (${reason}). openkodod needs ` +
        'a job that allows breakaway and a slot with the process-tree launcher; it never falls ' +
        'back to WMI.'
    )
    this.name = 'OpenkododWindowsLaunchRefusedError'
  }
}

/** The launcher reported that it could not start openkodod. */
export class OpenkododWindowsLaunchFailedError extends Error {
  constructor(detail: string) {
    super(`openkodod's Windows launcher did not start the candidate: ${detail}.`)
    this.name = 'OpenkododWindowsLaunchFailedError'
  }
}

/** Resolve pinned slot runtime and remove stale instance-stop intent before launch. */
export function windowsOpenkododLaunchRuntimeCommand(
  host: RemoteHostPlatform,
  slotDir: string
): string {
  return openkododWindowsSlotOpCommand(host, slotDir, 'slot-runtime', [
    slotDir,
    'clear-stop-request'
  ])
}

export function readWindowsOpenkododSlotRuntime(output: string): string {
  const runtime = readOpenkododWindowsEncodedAnswer(output, OPENKODOD_WINDOWS_RUNTIME_MARKER)
  if (!runtime) {
    throw new Error('The Windows host did not name the runtime this openkodod slot needs.')
  }
  return runtime
}

/** Older host scripts omit entry, implying the legacy single-file launcher. */
export function readWindowsOpenkododSlotEntry(
  output: string,
  host: RemoteHostPlatform,
  slotDir: string
): string {
  return (
    readOpenkododWindowsEncodedAnswer(output, OPENKODOD_WINDOWS_ENTRY_MARKER) ??
    joinRemotePath(host, slotDir, 'openkodod.js')
  )
}

export function windowsOpenkododLaunchCommand(
  host: RemoteHostPlatform,
  spec: OpenkododLaunchSpec,
  slotRuntime: string,
  slotEntry = joinRemotePath(host, spec.remoteInstallDir, 'openkodod.js')
): string {
  const dir = spec.remoteInstallDir
  return openkododWindowsNodeCommandLine(slotRuntime, [
    slotEntry,
    WINDOWS_BREAKAWAY_LAUNCH_FLAG,
    // CREATE_ALWAYS removes stale readiness before the launcher returns.
    WINDOWS_BREAKAWAY_STDOUT_FLAG,
    joinRemotePath(host, dir, OPENKODOD_READINESS_FILENAME),
    WINDOWS_BREAKAWAY_STDERR_FLAG,
    joinRemotePath(host, dir, OPENKODOD_LOG_FILENAME),
    // Preserve previous stderr for crash diagnosis across restart.
    WINDOWS_BREAKAWAY_STDERR_KEEP_PREVIOUS_FLAG,
    WINDOWS_BREAKAWAY_PROCESS_FILE_FLAG,
    joinRemotePath(host, dir, OPENKODOD_WINDOWS_PROCESS_FILENAME),
    WINDOWS_BREAKAWAY_ENV_FLAG,
    `OPENKODO_VERSION=${spec.fullVersion}`,
    WINDOWS_BREAKAWAY_ENV_FLAG,
    `OPENKODO_USER_DATA=${spec.userDataDir}`,
    ...openkododManagedLaunchEnv(spec).flatMap(([name, value]) => [
      WINDOWS_BREAKAWAY_ENV_FLAG,
      `${name}=${value}`
    ]),
    OPENKODOD_WINDOWS_BREAKAWAY_CONTRACT.argsFlag,
    '--json',
    '--bind',
    spec.bindHost,
    '--port',
    String(spec.port)
  ])
}

export function hasWindowsOpenkododLaunchReport(output: string): boolean {
  return parseWindowsBreakawayLaunchReport(OPENKODOD_WINDOWS_BREAKAWAY_CONTRACT, output) !== null
}

/** Return launched PID or surface native-breakaway refusal/failure. */
export function readWindowsOpenkododLaunchReport(output: string): number {
  const report = parseWindowsBreakawayLaunchReport(OPENKODOD_WINDOWS_BREAKAWAY_CONTRACT, output)
  if (report?.method === 'breakaway') {
    return report.pid
  }
  if (report?.method === 'unavailable') {
    throw new OpenkododWindowsLaunchRefusedError(
      report.step ? `${report.reason} at ${report.step}` : report.reason
    )
  }
  if (report?.method === 'failed') {
    throw new OpenkododWindowsLaunchFailedError(
      `${report.reason}${report.step ? ` at ${report.step}` : ''} (code ${String(report.code ?? 0)})`
    )
  }
  throw new Error("openkodod's Windows launcher did not start the candidate: no launch report.")
}
