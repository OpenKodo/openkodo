// Preferred ports may belong to other runtimes; tunnel to the active slot's published bound port.
import {
  getRuntimeSshAccess,
  type KnownRuntimeEnvironment
} from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import type { SshTarget } from '../../../shared/remote-runtime/ssh/ssh-types'
import type { ServeReadiness } from '../../server/serve-readiness'
import { managedOpenkododInstallDir } from './openkodod-managed-runtime-context'
import { resolveOpenkododRemoteContext } from '../install/openkodod-remote-context'
import {
  parseOpenkododReadinessWaitOutput,
  readOpenkododReadinessNowCommand
} from '../install/openkodod-remote-readiness-wait'
import {
  execOpenkododRemote,
  type OpenkododRemoteExecTarget
} from '../install/openkodod-remote-runtime-control'
import type {
  OpenkododHostTarget,
  OpenkododHostTransport
} from '../install/openkodod-host-transport'
import { parsePairingCode } from '../../../shared/remote-runtime/pairing/pairing'

export type OpenkododTunnelPortInput = {
  environment: KnownRuntimeEnvironment
  target: SshTarget
  connection: OpenkododHostTransport
}

export function openkododBoundPort(
  readiness: Pick<ServeReadiness, 'boundEndpoint'>
): number | null {
  if (!readiness.boundEndpoint) {
    return null
  }
  try {
    const port = Number(new URL(readiness.boundEndpoint).port)
    return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : null
  } catch {
    return null
  }
}

async function readManagedOpenkododSlotReadiness(
  target: OpenkododRemoteExecTarget & { remoteInstallDir: string }
): Promise<ServeReadiness | null> {
  const parsed = parseOpenkododReadinessWaitOutput(
    target.host,
    await execOpenkododRemote(
      target,
      readOpenkododReadinessNowCommand(target.host, target.remoteInstallDir)
    )
  )
  return parsed.state === 'ready' ? parsed.readiness : null
}

export async function readActiveManagedOpenkododReadiness(input: {
  target: OpenkododHostTarget
  connection: OpenkododHostTransport
}): Promise<ServeReadiness | null> {
  const context = await resolveOpenkododRemoteContext(input.target, input.connection)
  const active = context.activationRecord.active
  if (!active) {
    return null
  }
  return readManagedOpenkododSlotReadiness({
    conn: context.connection,
    host: context.host,
    remoteHome: context.remoteHome,
    remoteInstallDir: managedOpenkododInstallDir(context, active)
  })
}

async function readActiveSlotBoundPort(input: OpenkododTunnelPortInput): Promise<number | null> {
  if (!input.environment.openkododDeployment) {
    return null
  }
  const readiness = await readActiveManagedOpenkododReadiness(input)
  return readiness ? openkododBoundPort(readiness) : null
}

export async function resolveManagedOpenkododTunnelPort(
  input: OpenkododTunnelPortInput
): Promise<number> {
  const access = getRuntimeSshAccess(input.environment)
  if (!access) {
    throw new Error('Managed openkodod environment is missing its SSH tunnel dependency.')
  }
  try {
    return (await readActiveSlotBoundPort(input)) ?? access.remotePort
  } catch (error) {
    // Post-forward identity validation still detects a wrong server when falling back.
    console.warn(
      '[ssh] Could not read the managed OpenKodo server port; trying the preferred one:',
      error
    )
    return access.remotePort
  }
}

/** Missing or unreadable published ports never justify moving an existing tunnel. */
export async function readManagedOpenkododPublishedPort(
  input: OpenkododTunnelPortInput
): Promise<number | null> {
  try {
    return await readActiveSlotBoundPort(input)
  } catch {
    return null
  }
}

/** The server key the active slot offers to new pairings; null when unpublished or unreadable. */
export async function readManagedOpenkododPublishedKey(
  input: OpenkododTunnelPortInput
): Promise<string | null> {
  if (!input.environment.openkododDeployment) {
    return null
  }
  try {
    const readiness = await readActiveManagedOpenkododReadiness(input)
    return readiness?.pairing.available
      ? (parsePairingCode(readiness.pairing.url)?.publicKeyB64 ?? null)
      : null
  } catch {
    return null
  }
}
