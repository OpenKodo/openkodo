// Lost channels drop their sockets but keep the listener; tunnel reconnect logic owns recovery.
import { OpenkododStdioBridgeUnavailableError } from '../../openkodod/diagnostics/openkodod-host-unavailable'
import type { OpenkododHostTransport } from '../install/openkodod-host-transport'
import {
  checkOpenkododStdioBridge,
  openOpenkododStdioBridgeChannel,
  resolveOpenkododStdioBridge,
  type OpenkododStdioBridge
} from './openkodod-stdio-bridge'
import { listenOpenkododStdioBridge } from './openkodod-stdio-bridge-listener'

import type { RemoteCommandChannel } from '../install/remote-install-transport'
import type { SshConnection } from '../../ssh/connection/ssh-connection'
import type {
  PortForwardStartOptions,
  SshPortForwardProvider,
  StartedPortForward
} from '../../ssh/port-forwarding/ssh-port-forward-provider'

export type OpenkododStdioBridgeDependencies = {
  resolveBridge: (conn: OpenkododHostTransport, port: number) => Promise<OpenkododStdioBridge>
  checkBridge: (conn: OpenkododHostTransport, bridge: OpenkododStdioBridge) => Promise<unknown>
  openChannel: (
    conn: OpenkododHostTransport,
    bridge: OpenkododStdioBridge
  ) => Promise<RemoteCommandChannel>
}

export const OPENKODOD_STDIO_BRIDGE_DEPENDENCIES: OpenkododStdioBridgeDependencies = {
  resolveBridge: resolveOpenkododStdioBridge,
  checkBridge: checkOpenkododStdioBridge,
  openChannel: openOpenkododStdioBridgeChannel
}

export class OpenkododStdioBridgePortForwardProvider implements SshPortForwardProvider {
  constructor(
    private readonly dependencies: OpenkododStdioBridgeDependencies = OPENKODOD_STDIO_BRIDGE_DEPENDENCIES
  ) {}

  canHandle(conn: SshConnection): boolean {
    return conn.getClient() !== null || conn.usesSystemSshTransport()
  }

  start(conn: SshConnection, options: PortForwardStartOptions): Promise<StartedPortForward> {
    return startOpenkododStdioBridge(conn, options, this.dependencies)
  }
}

export async function startOpenkododStdioBridge(
  host: OpenkododHostTransport,
  options: PortForwardStartOptions,
  deps: OpenkododStdioBridgeDependencies,
  maxChannels?: number
): Promise<StartedPortForward> {
  let bridge: Promise<OpenkododStdioBridge> | null = null
  // Retry failed bridge resolution on the next socket.
  const resolveBridge = (): Promise<OpenkododStdioBridge> => {
    bridge ??= deps.resolveBridge(host, options.remotePort).catch((error: unknown) => {
      bridge = null
      throw error
    })
    return bridge
  }
  try {
    await deps.checkBridge(host, await resolveBridge())
  } catch (error) {
    if (error instanceof OpenkododStdioBridgeUnavailableError) {
      throw error
    }
    // Lost contact does not prove bridge absence; let new sockets resolve it again.
    console.warn('[ssh] OpenKodo stdio bridge check was unverifiable:', error)
  }
  return listenOpenkododStdioBridge(
    options,
    async () => {
      const resolved = await resolveBridge()
      return { channel: await deps.openChannel(host, resolved), mode: resolved.mode }
    },
    maxChannels
  )
}
