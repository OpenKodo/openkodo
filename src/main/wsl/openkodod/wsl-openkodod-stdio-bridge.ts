/** D2: each accepted loopback socket owns a pinned-Node wsl.exe stdio bridge. Avoid WSL localhost forwarding, whose startup refusal window and network-mode dependence make it unreliable. */
import {
  observeWslOpenkododBridgeChannel,
  type WslOpenkododBridgeChannelEvents
} from './wsl-openkodod-bridge-activity'
import type { OpenkododHostTransport } from '../../managed-server/install/openkodod-host-transport'
import {
  OPENKODOD_STDIO_BRIDGE_DEPENDENCIES,
  startOpenkododStdioBridge,
  type OpenkododStdioBridgeDependencies
} from '../../managed-server/lifecycle/openkodod-stdio-bridge-provider'
import type { StartedPortForward } from '../../ssh/port-forwarding/ssh-port-forward-provider'
import { assertWslUncPathRunning } from '../filesystem/wsl-unc-access-gate'

// One wsl.exe per socket and no SSH MaxSessions to share; this only bounds a leaky client's spawns.
const WSL_OPENKODOD_STDIO_BRIDGE_MAX_CHANNELS = 64

export type WslOpenkododStdioBridgeOptions = {
  environmentId: string
  /** The distro each bridge child runs in; a dial is refused while it is stopped (E9). */
  distro: string
  /** openkodod's loopback port inside the distro. */
  remotePort: number
  /** 0 picks a free one. */
  localPort: number
  label: string
  /** Each bridged socket's lifetime, for the liveness watch that rides the desktop's sockets. */
  events?: WslOpenkododBridgeChannelEvents
}

export function listenWslOpenkododStdioBridge(
  transport: OpenkododHostTransport,
  options: WslOpenkododStdioBridgeOptions,
  dependencies: OpenkododStdioBridgeDependencies = OPENKODOD_STDIO_BRIDGE_DEPENDENCIES
): Promise<StartedPortForward> {
  const { distro, events } = options
  return startOpenkododStdioBridge(
    transport,
    {
      id: `wsl-openkodod:${options.environmentId}`,
      connectionId: options.environmentId,
      localHost: '127.0.0.1',
      localPort: options.localPort,
      remoteHost: '127.0.0.1',
      remotePort: options.remotePort,
      label: options.label
    },
    {
      ...dependencies,
      openChannel: async (conn, bridge) => {
        // A dial (a client's reconnect, a runtime call, the watch) is never a user act, and each
        // spawns wsl.exe, which boots a stopped distro. A user act boots it by connecting first.
        await assertWslUncPathRunning('', distro)
        const channel = await dependencies.openChannel(conn, bridge)
        return events ? observeWslOpenkododBridgeChannel(channel, events) : channel
      }
    },
    WSL_OPENKODOD_STDIO_BRIDGE_MAX_CHANNELS
  )
}

type WslOpenkododStdioBridgeListen = (
  transport: OpenkododHostTransport,
  options: WslOpenkododStdioBridgeOptions
) => Promise<StartedPortForward>

/** A persisted local port may be taken by now; a free one beats no connection. */
export async function listenWslOpenkododStdioBridgeOnPreferredPort(
  transport: OpenkododHostTransport,
  options: WslOpenkododStdioBridgeOptions,
  listen: WslOpenkododStdioBridgeListen = listenWslOpenkododStdioBridge
): Promise<StartedPortForward> {
  try {
    return await listen(transport, options)
  } catch (error) {
    if (options.localPort === 0) {
      throw error
    }
    console.warn(
      `[wsl] Could not rebind local port ${options.localPort}; picking another:`,
      error instanceof Error ? error.message : error
    )
    return listen(transport, { ...options, localPort: 0 })
  }
}
