import type { WslHostDeferredUpdate } from '../../../shared/remote-runtime/wsl-hosts/wsl-host-types'
import type { PairingOffer } from '../../../shared/remote-runtime/pairing/mobile-relay-pairing-offer'
import type { OpenkododTunnelIdentity } from '../../managed-server/lifecycle/openkodod-managed-tunnel-identity'
import type { ServeReadiness } from '../../server/serve-readiness'
import type { OpenkododHostTransport } from '../../managed-server/install/openkodod-host-transport'
import type { StartedPortForward } from '../../ssh/port-forwarding/ssh-port-forward-provider'
import type { WslDistroHolder } from '../discovery/wsl-distro-holder-types'
import type { WslOpenkododConnectionStatus } from './wsl-openkodod-connection-status'
import type { WslOpenkododDeployOptions, WslOpenkododLaunch } from './wsl-openkodod-launch-contract'
import type { WslOpenkododHostTarget } from './wsl-openkodod-host-target'
import type { WslOpenkododPairingRecovery } from './wsl-openkodod-pairing-identity'
import type { WslOpenkododStdioBridgeOptions } from './wsl-openkodod-stdio-bridge'

/** One open bridge to a distro's openkodod, as the connection manager publishes it. */
export type WslOpenkododConnection = {
  distro: string
  environmentId: string
  /** The loopback port on this machine the pairing offer points at. */
  localPort: number
  /** openkodod's port inside the distro. */
  remotePort: number
  fullVersion: string
  /** openkodod's pid inside the distro, from its pid file; null when unreadable. */
  pid: number | null
  /** openkodod's pairing code, with its endpoint rewritten to `ws://127.0.0.1:<localPort>`. */
  pairingOffer: string
  /** An app update the incumbent `fullVersion` is waiting to take (live terminals). */
  deferredUpdate: WslHostDeferredUpdate | null
  close(): Promise<void>
}

export type WslOpenkododConnectionDependencies = {
  holder?: WslDistroHolder
  getPairingOffer?: (environmentId: string) => PairingOffer | null | Promise<PairingOffer | null>
  /** The bridge port the host's record saved: rebinding it keeps the pairing across app restarts. */
  recordedLocalPort?: (environmentId: string) => number | null | Promise<number | null>
  deployAndLaunch?: (
    distro: string,
    options: WslOpenkododDeployOptions
  ) => Promise<WslOpenkododLaunch>
  createTransport?: (target: WslOpenkododHostTarget) => OpenkododHostTransport
  listen?: (
    transport: OpenkododHostTransport,
    options: WslOpenkododStdioBridgeOptions
  ) => Promise<StartedPortForward>
  verifyIdentity?: (
    pairingOffer: string,
    readiness: ServeReadiness
  ) => Promise<OpenkododTunnelIdentity>
  /** Re-pairs a refused enrolled token; without it a refusal fails the connect. */
  pairingRecovery?: Omit<WslOpenkododPairingRecovery, 'environmentId'>
  /** A connection (re)opened, its offer changed, or its status moved; null once it closed. */
  onChange?: (
    distro: string,
    connection: WslOpenkododConnection | null,
    status: WslOpenkododConnectionStatus
  ) => void
}
