import {
  getPreferredPairingOffer,
  getRuntimeSshAccess,
  type KnownRuntimeEnvironment
} from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import {
  readManagedOpenkododPublishedKey,
  readManagedOpenkododPublishedPort,
  resolveManagedOpenkododTunnelPort,
  type OpenkododTunnelPortInput
} from './openkodod-managed-bound-port'
import {
  OpenkododManagedIdentityError,
  openkododIdentityRefusal,
  verifyManagedOpenkododTunnelIdentity,
  type OpenkododTunnelIdentity
} from './openkodod-managed-tunnel-identity'
import { managedOpenkododSlot } from './openkodod-managed-runtime-context'
import {
  OpenkododCrashLoopError,
  wakeManagedOpenkododUnlessCrashLooping
} from './openkodod-managed-crash-loop'
import { resolveOpenkododRemoteContext } from '../install/openkodod-remote-context'
import type { SshConnection } from '../../ssh/connection/ssh-connection'
import type { PortForwardEntry } from '../../../shared/remote-runtime/ssh/ssh-types'
import type { SshPortForwardManager } from '../../ssh/port-forwarding/ssh-port-forward'

export type OpenkododManagedTunnelTargeting = {
  resolveRemotePort: (input: OpenkododTunnelPortInput) => Promise<number>
  verifyIdentity: (environment: KnownRuntimeEnvironment) => Promise<OpenkododTunnelIdentity>
  /** Wake only proven-stopped slots before rereading ports after foreign answers. */
  wakeStoppedServer?: (input: OpenkododTunnelPortInput) => Promise<void>
  readPublishedPort?: (input: OpenkododTunnelPortInput) => Promise<number | null>
  /** The server key this host's own slot publishes; null when unreadable. */
  readPublishedKey?: (input: OpenkododTunnelPortInput) => Promise<string | null>
}

/** `replaced`: the host's own slot answers SSH with a server key other than the pinned one. */
export type OpenkododForwardIdentity =
  | OpenkododTunnelIdentity
  | { verdict: 'replaced'; detail: string; environment: { id: string; name: string } }

export const MANAGED_OPENKODOD_TUNNEL_TARGETING: OpenkododManagedTunnelTargeting = {
  resolveRemotePort: resolveManagedOpenkododTunnelPort,
  verifyIdentity: verifyManagedOpenkododTunnelIdentity,
  wakeStoppedServer: wakeStoppedManagedOpenkododForTunnel,
  readPublishedPort: readManagedOpenkododPublishedPort,
  readPublishedKey: readManagedOpenkododPublishedKey
}

// Stopped slots may have lost their port; waking publishes a new free port for the reread.
async function wakeStoppedManagedOpenkododForTunnel(
  input: OpenkododTunnelPortInput
): Promise<void> {
  const access = getRuntimeSshAccess(input.environment)
  if (!access) {
    return
  }
  let wake: Awaited<ReturnType<typeof wakeManagedOpenkododUnlessCrashLooping>>
  try {
    const context = await resolveOpenkododRemoteContext(input.target, input.connection)
    wake = await wakeManagedOpenkododUnlessCrashLooping(
      input.environment.id,
      input.target.label,
      managedOpenkododSlot(context, access.remotePort)
    )
  } catch (error) {
    // Failed wake does not settle identity; reread and validate the resulting forward.
    console.warn(
      '[ssh] Could not start the managed OpenKodo server behind a foreign answer:',
      error
    )
    return
  }
  // The crash-loop reason beats the foreign-port mismatch the reread would report.
  if (wake.outcome === 'crash-loop') {
    throw new OpenkododCrashLoopError(wake.detail)
  }
}

/** Tests may trust persisted ports without an identity round trip. */
export const PERSISTED_PORT_TARGETING: OpenkododManagedTunnelTargeting = {
  resolveRemotePort: async ({ environment }) => getRuntimeSshAccess(environment)?.remotePort ?? 0,
  verifyIdentity: async () => ({ verdict: 'verified' })
}

type VerifiedOpenkododForwardArgs = {
  targetId: string
  connection: SshConnection
  forwards: SshPortForwardManager
  localPort: number
  label: string
  remotePort: number
  /** Without a reread, foreign answers fail immediately. */
  rereadRemotePort?: () => Promise<number>
  /** Omit when the caller validates identity itself. */
  verify?: (localPort: number) => Promise<OpenkododForwardIdentity>
  stillCurrent: () => boolean | Promise<() => boolean>
}

export type OpenkododTunnelStartChecks = Pick<
  VerifiedOpenkododForwardArgs,
  'rereadRemotePort' | 'verify'
> & {
  /** Persisted preferred port when the server bound elsewhere. */
  preferredPort?: number
}

export async function environmentForwardChecks(
  targeting: OpenkododManagedTunnelTargeting,
  input: OpenkododTunnelPortInput
): Promise<
  Required<Pick<VerifiedOpenkododForwardArgs, 'remotePort' | 'rereadRemotePort' | 'verify'>>
> {
  return {
    remotePort: await targeting.resolveRemotePort(input),
    rereadRemotePort: async () => {
      await targeting.wakeStoppedServer?.(input)
      return targeting.resolveRemotePort(input)
    },
    verify: async () => {
      const identity = await targeting.verifyIdentity(input.environment)
      if (identity.verdict !== 'foreign' || !targeting.readPublishedKey) {
        return identity
      }
      // A refusal from the slot's own new server is a replaced pairing, not a port another OpenKodo took.
      const publishedKey = await targeting.readPublishedKey(input)
      return publishedKey &&
        publishedKey !== getPreferredPairingOffer(input.environment).publicKeyB64
        ? { verdict: 'replaced', detail: identity.detail, environment: input.environment }
        : identity
    }
  }
}

/** Remove superseded forwards; retry foreign ports once. Pinned-server token refusals fail immediately. */
export async function forwardToVerifiedOpenkodod(
  args: VerifiedOpenkododForwardArgs
): Promise<PortForwardEntry | null> {
  let remotePort = args.remotePort
  for (let attempt = 0; ; attempt++) {
    const forward = await addCurrentForward(args, remotePort)
    if (!forward) {
      return null
    }
    const identity = args.verify
      ? await args.verify(forward.localPort)
      : ({ verdict: 'verified' } as const)
    if (!(await prepareCurrentTunnelCheck(args.stillCurrent))()) {
      await args.forwards.removeForwardAndWait(forward.id)
      return null
    }
    if (identity.verdict === 'verified' || identity.verdict === 'unreachable') {
      if (identity.verdict === 'unreachable') {
        // Unreachable servers may be down or starting; this is not proof of a foreign server.
        console.warn(
          `[ssh] Managed OpenKodo server did not answer through its tunnel: ${identity.detail}`
        )
      }
      return forward
    }
    await args.forwards.removeForwardAndWait(forward.id)
    // Token refusal from our pinned server is not a moved port; waking cannot repair pairing.
    if (identity.verdict === 'unpaired') {
      throw openkododIdentityRefusal(remotePort, identity)
    }
    // Rereading the port cannot reach the pinned server once the slot itself serves another key.
    if (identity.verdict === 'replaced') {
      throw OpenkododManagedIdentityError.replacedServer(identity.environment, identity.detail)
    }
    const reread =
      attempt === 0 && args.rereadRemotePort ? await args.rereadRemotePort() : remotePort
    if (reread === remotePort || !(await prepareCurrentTunnelCheck(args.stillCurrent))()) {
      throw openkododIdentityRefusal(remotePort, identity)
    }
    remotePort = reread
  }
}

async function addCurrentForward(
  args: VerifiedOpenkododForwardArgs,
  remotePort: number
): Promise<PortForwardEntry | null> {
  const forward = await args.forwards.addForward(
    args.targetId,
    args.connection,
    args.localPort,
    '127.0.0.1',
    remotePort,
    args.label
  )
  if (args.localPort !== 0 && forward.localPort !== args.localPort) {
    await args.forwards.removeForwardAndWait(forward.id)
    throw new Error('Managed OpenKodo tunnel bound an unexpected local port.')
  }
  if (!(await prepareCurrentTunnelCheck(args.stillCurrent))()) {
    await args.forwards.removeForwardAndWait(forward.id)
    return null
  }
  return forward
}

async function prepareCurrentTunnelCheck(
  check: VerifiedOpenkododForwardArgs['stillCurrent']
): Promise<() => boolean> {
  const current = await check()
  return typeof current === 'function' ? current : () => current
}
