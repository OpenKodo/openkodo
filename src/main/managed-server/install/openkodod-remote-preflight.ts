import { randomUUID } from 'node:crypto'
import { OPENKODOD_NODE_RUNTIME_IDENTITY } from '../../../shared/remote-runtime/openkodod-distribution/openkodod-node-runtime-identity'
import { OPENKODOD_NODE_RUNTIME_MARKER_FILENAME } from '../../../shared/remote-runtime/openkodod-distribution/openkodod-artifacts'
import {
  OPENKODOD_PROFILE_PREFLIGHT_FLAG,
  OPENKODOD_PROFILE_PREFLIGHT_TIMEOUT_MS,
  parseOpenkododProfilePreflight,
  type OpenkododProfilePreflightResponse
} from '../../../shared/remote-runtime/openkodod-distribution/openkodod-profile-preflight'
import { assertPosixOpenkododHost } from './openkodod-remote-host-support'
import {
  openkododWindowsNodeCommandLine,
  openkododWindowsSlotOpCommand,
  readOpenkododWindowsEncodedAnswer
} from './openkodod-remote-windows-node'
import { readWindowsOpenkododSlotEntry } from './openkodod-remote-launch-windows'
import { OPENKODOD_WINDOWS_RUNTIME_MARKER } from '../host-state/openkodod-windows-host-script'
import {
  openkododNodeSlotRuntimeCommand,
  selectOpenkododSlotEntryCommand
} from './openkodod-remote-runtime'
import { execCommand, isSshCommandExitError } from '../../ssh/remote-exec/remote-exec-command'
import { SYSTEM_SSH_TRANSPORT_EXIT_CODE } from '../../ssh/system-transport/system-ssh-operation-lifecycle'
import { errorMessage } from '../../../shared/errors/error-message'
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import {
  isWindowsRemoteHost,
  joinRemotePath,
  type RemoteHostPlatform
} from '../../ssh/remote-host/ssh-remote-platform'
import type { OpenkododHostTransport } from './openkodod-host-transport'

/** The preflight timed out or lost its channel before the host answered, so it proves nothing about the host. */
export class OpenkododPreflightUnansweredError extends Error {
  constructor(cause: unknown) {
    super(errorMessage(cause), { cause })
    this.name = 'OpenkododPreflightUnansweredError'
  }
}

export function openkododProfilePreflightCommand(
  host: RemoteHostPlatform,
  directory: string,
  nonce: string,
  probeDaemonsUnder?: string
): string {
  assertPosixOpenkododHost(host)
  // New candidates always use pinned Node; host Node fallback could mask an incomplete slot.
  const marker = quotePosixShell(
    joinRemotePath(host, directory, OPENKODOD_NODE_RUNTIME_MARKER_FILENAME)
  )
  const launch = [
    'OPENKODO_BACKGROUND_LAUNCH=1',
    '"$openkodod_runtime"',
    '"$openkodod_entry"',
    OPENKODOD_PROFILE_PREFLIGHT_FLAG,
    quotePosixShell(nonce),
    ...(probeDaemonsUnder === undefined ? [] : [quotePosixShell(probeDaemonsUnder)])
  ].join(' ')
  return `[ -e ${marker} ] || exit 78; ${openkododNodeSlotRuntimeCommand(host, directory)}${selectOpenkododSlotEntryCommand(host, directory)}; ${launch}`
}

/** Qualify the candidate; given the served data root, it also names the daemon generations alive there. */
export async function preflightInstalledOpenkodod(options: {
  conn: OpenkododHostTransport
  host: RemoteHostPlatform
  remoteInstallDir: string
  probeDaemonsUnder?: string
  fullVersion: string
  signal?: AbortSignal
}): Promise<OpenkododProfilePreflightResponse> {
  const nonce = randomUUID()
  const command = isWindowsRemoteHost(options.host)
    ? await windowsOpenkododProfilePreflightCommand(options, nonce)
    : openkododProfilePreflightCommand(
        options.host,
        options.remoteInstallDir,
        nonce,
        options.probeDaemonsUnder
      )
  const output = await execPreflightCommand(options.conn, command, {
    signal: options.signal,
    timeoutMs: OPENKODOD_PROFILE_PREFLIGHT_TIMEOUT_MS,
    wrapCommand: !isWindowsRemoteHost(options.host)
  })
  return parseOpenkododProfilePreflight(
    output,
    nonce,
    OPENKODOD_NODE_RUNTIME_IDENTITY,
    options.fullVersion
  )
}

async function execPreflightCommand(
  conn: OpenkododHostTransport,
  command: string,
  options: NonNullable<Parameters<typeof execCommand>[2]>
): Promise<string> {
  const systemSsh = conn.usesSystemSshTransport?.() === true
  try {
    return await execCommand(conn, command, options)
  } catch (error) {
    // Only the remote command's own exit is the host's answer; OpenSSH exits 255 for itself.
    const hostExited =
      isSshCommandExitError(error) &&
      !(systemSsh && error.exitCode === SYSTEM_SSH_TRANSPORT_EXIT_CODE)
    if (hostExited || options.signal?.aborted) {
      throw error
    }
    throw new OpenkododPreflightUnansweredError(error)
  }
}

// Windows uses plain argv; openkodod opens no window and needs no background-launch environment.
async function windowsOpenkododProfilePreflightCommand(
  options: {
    conn: OpenkododHostTransport
    host: RemoteHostPlatform
    remoteInstallDir: string
    probeDaemonsUnder?: string
    signal?: AbortSignal
  },
  nonce: string
): Promise<string> {
  const { host, remoteInstallDir } = options
  const slotAnswer = await execPreflightCommand(
    options.conn,
    openkododWindowsSlotOpCommand(host, remoteInstallDir, 'slot-runtime', [remoteInstallDir]),
    { signal: options.signal, wrapCommand: false }
  )
  const runtime = readOpenkododWindowsEncodedAnswer(slotAnswer, OPENKODOD_WINDOWS_RUNTIME_MARKER)
  if (!runtime) {
    throw new Error('The Windows host did not name the runtime this openkodod slot needs.')
  }
  return openkododWindowsNodeCommandLine(runtime, [
    readWindowsOpenkododSlotEntry(slotAnswer, host, remoteInstallDir),
    OPENKODOD_PROFILE_PREFLIGHT_FLAG,
    nonce,
    ...(options.probeDaemonsUnder === undefined ? [] : [options.probeDaemonsUnder])
  ])
}
