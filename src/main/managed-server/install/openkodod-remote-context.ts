import type { NodeRuntimeTarget } from '../../../shared/node-runtime/node-runtime-pin'
import type { SshTarget } from '../../../shared/remote-runtime/ssh/ssh-types'
import type { OpenkododActivationRecord } from '../activation/openkodod-activation-record'
import { readOpenkododActivationRecord } from '../activation/openkodod-activation-record-store'
import { resolveOpenkododRuntimeTarget } from '../lifecycle/openkodod-runtime-target'
import { LINUX_LIBC_FIRST_PROBE } from '../../node-runtime/linux-libc-probe'
import { execCommand } from '../../ssh/remote-exec/remote-exec-command'
import { prepareWindowsOpenkododHost } from '../host-state/openkodod-windows-host-preparation'
import {
  isWslOpenkododHostTarget,
  type OpenkododHostTarget,
  type OpenkododHostTransport
} from './openkodod-host-transport'
import {
  decideOpenkododMachineHome,
  openkododMachineDataRoot,
  openkododMachineHomeDir,
  openkododMachineHomeProbeCommand,
  openkododMachineOwnershipUnresolvedMessage,
  parseOpenkododMachineHomeProbe
} from '../host-state/openkodod-machine-home'
import {
  openkododMachineClaimCommand,
  readOpenkododMachineClaimAnswer
} from '../host-state/openkodod-machine-claim-command'
import {
  execOpenkododRemote,
  type OpenkododRemoteExecTarget
} from './openkodod-remote-runtime-control'
import { readRemoteHomeCommand } from '../../ssh/remote-exec/ssh-remote-commands'
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import {
  isWindowsRemoteHost,
  joinRemotePath,
  normalizeRemoteHome,
  validateRemoteHome,
  type RemoteHostPlatform
} from '../../ssh/remote-host/ssh-remote-platform'
import { detectRemoteHostPlatform } from '../../ssh/remote-host/ssh-remote-platform-detection'
import { OpenkododHostUnsupportedError } from '../../openkodod/diagnostics/openkodod-host-unavailable'
import { rememberSshHostPlatform } from '../../ssh/remote-host/ssh-host-platform-memo'

/** Default SSH generic retains compatibility with lifecycle consumers requiring SSH-only fields. */
export type OpenkododRemoteContext<Target extends OpenkododHostTarget = SshTarget> = {
  activationRecord: OpenkododActivationRecord
  /** Select a compatible runtime when host glibc is below the default pin's floor. */
  serverTarget: NodeRuntimeTarget
  connection: OpenkododHostTransport
  host: RemoteHostPlatform
  /** Login or machine-specific home for shared-home isolation; userDataDir must follow the same owner. */
  remoteHome: string
  target: Target
  userDataDir: string
}

export async function resolveOpenkododRemoteContext<Target extends OpenkododHostTarget = SshTarget>(
  target: Target,
  connection: OpenkododHostTransport,
  signal?: AbortSignal,
  detectedHost?: RemoteHostPlatform,
  /**
   * Facts the caller already read on this host. `loginHome` serves only login-home placement;
   * `firstLibcProbeOutput` answers the libc probe's first command, whose fallbacks still run.
   */
  known: {
    loginHome?: string
    firstLibcProbeOutput?: string
    /** Replaces the plain activation record read; WSL reads its connect snapshot here. */
    readActivationRecord?: (
      target: OpenkododRemoteExecTarget & { remoteHome: string; userDataDir: string }
    ) => Promise<OpenkododActivationRecord>
  } = {}
): Promise<OpenkododRemoteContext<Target>> {
  const host = detectedHost ?? (await detectRemoteHostPlatform(connection, { signal }))
  if (!host) {
    throw new OpenkododHostUnsupportedError(
      isWslOpenkododHostTarget(target)
        ? 'OpenKodo’s server doesn’t support this WSL distro’s platform. Use an x64 or arm64 Linux distro.'
        : 'OpenKodo’s server doesn’t support this SSH host’s platform.'
    )
  }
  const remote = { conn: connection, host, signal }
  const { openkododHome: remoteHome, userDataDir } = await resolveOpenkododMachineHome(
    remote,
    !isWslOpenkododHostTarget(target),
    known.loginHome
  )
  let firstLibcProbeOutput = known.firstLibcProbeOutput
  const serverTarget = await resolveOpenkododRuntimeTarget({
    conn: connection,
    host,
    signal,
    ...(firstLibcProbeOutput === undefined
      ? {}
      : {
          exec: async (command: string) => {
            if (command === LINUX_LIBC_FIRST_PROBE && firstLibcProbeOutput !== undefined) {
              const output = firstLibcProbeOutput
              firstLibcProbeOutput = undefined
              return output
            }
            // The fallbacks run exactly as the default exec would.
            return execCommand(connection, command, { signal })
          }
        })
  })
  if (!isWslOpenkododHostTarget(target)) {
    rememberSshHostPlatform(target.id, host, serverTarget)
  }
  if (isWindowsRemoteHost(host)) {
    // Prepare pinned Node before even reading activation state on Windows.
    await prepareWindowsOpenkododHost({
      conn: connection,
      host,
      remoteHome,
      serverTarget,
      signal
    })
  }
  const activationRecord = await (known.readActivationRecord ?? readOpenkododActivationRecord)({
    ...remote,
    remoteHome,
    userDataDir
  })
  return {
    activationRecord,
    serverTarget,
    connection,
    host,
    remoteHome,
    target,
    userDataDir
  }
}

/** Resolve per-machine state for shared POSIX homes; Windows and WSL retain login-home placement. */
export async function resolveOpenkododMachineHome(
  remote: OpenkododRemoteExecTarget,
  keyByMachine: boolean,
  knownLoginHome?: string
): Promise<{ loginHome: string; openkododHome: string; userDataDir: string }> {
  const { host } = remote
  if (!keyByMachine || isWindowsRemoteHost(host)) {
    const loginHome = normalizeRemoteHome(
      knownLoginHome ?? (await execOpenkododRemote(remote, readRemoteHomeCommand(host))),
      host
    )
    if (!validateRemoteHome(loginHome, host)) {
      throw new Error(`Remote home is not a valid path: ${loginHome.slice(0, 100)}`)
    }
    return {
      loginHome,
      openkododHome: loginHome,
      userDataDir: joinRemotePath(host, loginHome, '.openkodo')
    }
  }
  const probe = parseOpenkododMachineHomeProbe(
    await execOpenkododRemote(remote, openkododMachineHomeProbeCommand(host)),
    host
  )
  const { loginHome } = probe
  let decision = decideOpenkododMachineHome(probe, host)
  if (decision.kind === 'unresolved') {
    throw new Error(
      openkododMachineOwnershipUnresolvedMessage(
        decision.machineKey,
        probe.identity?.hostname ?? null,
        decision.cause
      )
    )
  }
  if (decision.kind === 'claim') {
    const won = readOpenkododMachineClaimAnswer(
      await execOpenkododRemote(
        remote,
        openkododMachineClaimCommand(host, loginHome, decision.machineKey)
      )
    )
    if (won.state !== 'present') {
      throw new Error(won.message)
    }
    decision =
      won.machineKey === decision.machineKey
        ? { kind: 'login-home' }
        : { kind: 'machine-home', machineKey: decision.machineKey }
  }
  if (decision.kind === 'login-home') {
    return {
      loginHome,
      openkododHome: loginHome,
      userDataDir: joinRemotePath(host, loginHome, '.openkodo')
    }
  }
  const openkododHome = openkododMachineHomeDir(host, loginHome, decision.machineKey)
  await execOpenkododRemote(remote, `umask 077; mkdir -p ${quotePosixShell(openkododHome)}`)
  return {
    loginHome,
    openkododHome,
    userDataDir: openkododMachineDataRoot(host, loginHome, decision.machineKey)
  }
}
