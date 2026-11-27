// SSH DefaultShell may be cmd.exe or PowerShell; commands must parse identically in both.
import { currentOpenkododFence } from '../activation/openkodod-activation-fence-scope'
import { OPENKODOD_WINDOWS_FENCE_ARG } from '../host-state/openkodod-windows-host-fence-ops'
import {
  OPENKODOD_NODE_RUNTIME_DIR_PREFIX,
  OPENKODOD_NODE_RUNTIME_WINDOWS_EXECUTABLE,
  OPENKODOD_RUNTIMES_DIRNAME
} from '../../../shared/remote-runtime/openkodod-distribution/openkodod-artifacts'
import {
  pinnedNodeRuntimeAsset,
  type NodeRuntimeTarget
} from '../../../shared/node-runtime/node-runtime-pin'
import { randomUUID } from 'node:crypto'
import type { OpenkododHostTransport } from './openkodod-host-transport'
import {
  execCommand,
  isUnconfirmedSshCommandTermination
} from '../../ssh/remote-exec/remote-exec-command'
import { RELAY_REMOTE_DIR } from './remote-install-root'
import {
  joinRemotePath,
  remoteDirname,
  type RemoteHostPlatform
} from '../../ssh/remote-host/ssh-remote-platform'
import { quotePowerShellLiteral as powerShellLiteral } from '../../../shared/shell/launch/powershell-native-argument'
import { OPENKODOD_WINDOWS_COMMAND_LINE_UNSAFE_CODE } from '../../openkodod/diagnostics/openkodod-host-unavailable'
import {
  OPENKODOD_WINDOWS_HOST_SCRIPT,
  OPENKODOD_WINDOWS_HOST_SCRIPT_FILENAME,
  OPENKODOD_WINDOWS_HOST_SCRIPT_PRESENT,
  type OpenkododWindowsHostOp
} from '../host-state/openkodod-windows-host-script'

const BARE_EXECUTABLE = /^[A-Za-z]:\\[A-Za-z0-9._+~\\-]*$/u
// Leading digits are quoted: PowerShell would read `1e5` as a number and pass `100000`.
const BARE_ARGUMENT = /^[A-Za-z-][A-Za-z0-9._:+=/\\-]*$/u
// cmd.exe expands %; PowerShell expands $, backticks and typographic quotes inside double quotes.
const UNQUOTABLE = /["%$`\r\n\u201C\u201D\u201E\u2018\u2019\u201A\u201B]/u

export class OpenkododWindowsCommandLineError extends Error {
  readonly code = OPENKODOD_WINDOWS_COMMAND_LINE_UNSAFE_CODE
  constructor(value: string) {
    super(
      `OpenKodo cannot pass ${JSON.stringify(value)} to node.exe on this Windows host: it contains ` +
        'a character cmd.exe or PowerShell would expand.'
    )
    this.name = 'OpenkododWindowsCommandLineError'
  }
}

function windowsPath(value: string): string {
  return value.replace(/\//gu, '\\')
}

function quotedArgument(value: string): string {
  if (BARE_ARGUMENT.test(value)) {
    return value
  }
  // A trailing backslash would escape the closing quote for CommandLineToArgvW.
  if (value === '' || UNQUOTABLE.test(value) || value.endsWith('\\')) {
    throw new OpenkododWindowsCommandLineError(value)
  }
  return `"${value}"`
}

export function openkododWindowsNodeCommandLine(
  executable: string,
  args: readonly string[]
): string {
  const program = windowsPath(executable)
  const argv = args.map(quotedArgument)
  if (BARE_EXECUTABLE.test(program)) {
    return [program, ...argv].join(' ')
  }
  // The inner line is single-quoted PowerShell inside one double-quoted argument both shells keep.
  for (const value of [program, ...args]) {
    if (UNQUOTABLE.test(value)) {
      throw new OpenkododWindowsCommandLineError(value)
    }
  }
  const inner = ['&', ...[program, ...args].map(powerShellLiteral)].join(' ')
  return `powershell.exe -NoProfile -NonInteractive -Command "${inner}"`
}

export function openkododRemoteBaseDir(host: RemoteHostPlatform, remoteHome: string): string {
  return joinRemotePath(host, remoteHome, RELAY_REMOTE_DIR)
}

export function openkododWindowsBaseDir(host: RemoteHostPlatform, slotDir: string): string {
  return remoteDirname(slotDir.replace(/\/+$/u, ''), host)
}

export function openkododWindowsPinnedNodePath(host: RemoteHostPlatform, baseDir: string): string {
  const target: NodeRuntimeTarget = host.arch === 'arm64' ? 'win32-arm64' : 'win32-x64'
  return joinRemotePath(
    host,
    baseDir,
    OPENKODOD_RUNTIMES_DIRNAME,
    `${OPENKODOD_NODE_RUNTIME_DIR_PREFIX}${pinnedNodeRuntimeAsset(target).executableSha256}`,
    OPENKODOD_NODE_RUNTIME_WINDOWS_EXECUTABLE
  )
}

function openkododWindowsHostScriptPath(host: RemoteHostPlatform, baseDir: string): string {
  return joinRemotePath(host, baseDir, OPENKODOD_WINDOWS_HOST_SCRIPT_FILENAME)
}

export function openkododWindowsHostOpCommand(
  host: RemoteHostPlatform,
  baseDir: string,
  op: OpenkododWindowsHostOp,
  args: readonly string[]
): string {
  const fence = currentOpenkododFence()
  return openkododWindowsNodeCommandLine(openkododWindowsPinnedNodePath(host, baseDir), [
    openkododWindowsHostScriptPath(host, baseDir),
    ...(fence ? [OPENKODOD_WINDOWS_FENCE_ARG, fence.lockDir, fence.token] : []),
    op,
    ...args
  ])
}

export function openkododWindowsSlotOpCommand(
  host: RemoteHostPlatform,
  slotDir: string,
  op: OpenkododWindowsHostOp,
  args: readonly string[]
): string {
  return openkododWindowsHostOpCommand(host, openkododWindowsBaseDir(host, slotDir), op, args)
}

export function openkododWindowsHomeOpCommand(
  host: RemoteHostPlatform,
  remoteHome: string,
  op: OpenkododWindowsHostOp,
  args: readonly string[]
): string {
  return openkododWindowsHostOpCommand(host, openkododRemoteBaseDir(host, remoteHome), op, args)
}

const stagedHostScripts = new WeakMap<OpenkododHostTransport, Set<string>>()

/** Content-addressed scripts publish atomically so concurrent readers never see truncated code. */
export async function installOpenkododWindowsHostScript(
  target: { conn: OpenkododHostTransport; host: RemoteHostPlatform; signal?: AbortSignal },
  baseDir: string
): Promise<void> {
  const scriptPath = openkododWindowsHostScriptPath(target.host, baseDir)
  const staged = stagedHostScripts.get(target.conn) ?? new Set<string>()
  stagedHostScripts.set(target.conn, staged)
  if (staged.has(scriptPath)) {
    return
  }
  // Run staged host-script ops rather than inline code.
  const runOp = async (
    script: string,
    op: OpenkododWindowsHostOp,
    args: string[]
  ): Promise<boolean> => {
    const command = openkododWindowsNodeCommandLine(
      openkododWindowsPinnedNodePath(target.host, baseDir),
      [script, op, ...args]
    )
    const answer = await execCommand(target.conn, command, {
      wrapCommand: false,
      signal: target.signal
    }).catch((error: unknown) => {
      if (isUnconfirmedSshCommandTermination(error)) {
        throw error
      }
      return ''
    })
    return answer.trim().split(/\r?\n/u).at(-1) === OPENKODOD_WINDOWS_HOST_SCRIPT_PRESENT
  }
  if (!(await runOp(scriptPath, 'script-present', []))) {
    const partial = `${scriptPath}.${randomUUID()}.partial`
    await target.conn.writeFile(partial, OPENKODOD_WINDOWS_HOST_SCRIPT, {
      hostPlatform: target.host,
      signal: target.signal
    })
    if (!(await runOp(partial, 'script-install', [scriptPath]))) {
      throw new Error(`Could not stage the openkodod host script at ${scriptPath}.`)
    }
  }
  staged.add(scriptPath)
}

export function readOpenkododWindowsEncodedAnswer(output: string, marker: string): string | null {
  const line = output
    .split(/\r?\n/u)
    .map((candidate) => candidate.trim())
    .findLast((candidate) => candidate === marker || candidate.startsWith(`${marker} `))
  if (line === undefined) {
    return null
  }
  const encoded = line.slice(marker.length).trim()
  if (!/^[A-Za-z0-9+/]*={0,2}$/u.test(encoded)) {
    return null
  }
  return Buffer.from(encoded, 'base64').toString('utf8')
}
