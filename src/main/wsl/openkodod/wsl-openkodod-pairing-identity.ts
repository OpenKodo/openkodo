import { pairedRuntimeConnectionFromOffer } from '../../../shared/remote-runtime/pairing/paired-runtime-connection'
import { parsePairingCode } from '../../../shared/remote-runtime/pairing/pairing'
import type { PairingOffer } from '../../../shared/remote-runtime/pairing/mobile-relay-pairing-offer'
import type { ServeReadiness } from '../../server/serve-readiness'
import {
  openkododIdentityRefusal,
  verifyOpenkododPairingIdentity,
  type OpenkododTunnelIdentity
} from '../../managed-server/lifecycle/openkodod-managed-tunnel-identity'
import { tunneledOpenkododPairingCode } from '../../managed-server/lifecycle/openkodod-tunneled-pairing'
import { getPreferredPairingOffer } from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import {
  buildWithPairingRepair,
  type ManagedOpenkododPairingRecovery
} from '../../managed-server/lifecycle/openkodod-managed-tunnel-pairing-recovery'
import type { WslOpenkododLaunch } from './wsl-openkodod-launch-contract'

/** The managed repair gate a refused enrolled token goes through, for one WSL host. */
export type WslOpenkododPairingRecovery = Omit<ManagedOpenkododPairingRecovery, 'ensure'> & {
  environmentId: string
}

/** Reconnect with enrolled token/pinned host key. Repair refusal once through the gate and verify the replacement; startup offers are for enrollment only. */
export async function resolveWslOpenkododPairing(
  launch: Extract<WslOpenkododLaunch, { outcome: 'ready' }>,
  localPort: number,
  paired: PairingOffer | null,
  verifyIdentity = verifyWslOpenkododIdentity,
  recovery?: WslOpenkododPairingRecovery
): Promise<string> {
  const verified = (offer: PairingOffer | null) =>
    verifyWslOpenkododPairing(launch, localPort, offer, verifyIdentity)
  // First-time pairing has no enrolled token to repair.
  if (!recovery || !paired) {
    return verified(paired)
  }
  let pairingOffer = ''
  await buildWithPairingRepair(
    {
      ...recovery,
      ensure: async (environment) => {
        pairingOffer = await verified(getPreferredPairingOffer(environment))
      }
    },
    recovery.environmentId,
    async () => {
      pairingOffer = await verified(paired)
    }
  )
  return pairingOffer
}

async function verifyWslOpenkododPairing(
  launch: Extract<WslOpenkododLaunch, { outcome: 'ready' }>,
  localPort: number,
  paired: PairingOffer | null,
  verifyIdentity: typeof verifyWslOpenkododIdentity
): Promise<string> {
  const pairingOffer = tunneledOpenkododPairingCode(launch.readiness, localPort, paired)
  const identity = await verifyIdentity(pairingOffer, launch.readiness)
  if (identity.verdict === 'foreign' || identity.verdict === 'unpaired') {
    throw openkododIdentityRefusal(launch.port, identity)
  }
  if (identity.verdict === 'unreachable') {
    console.warn(
      `[wsl] OpenKodo server in ${launch.distro} did not answer its bridge: ${identity.detail}`
    )
  }
  return pairingOffer
}

/** Whether the server behind a WSL bridge is the openkodod that published `readiness`. */
export async function verifyWslOpenkododIdentity(
  pairingOffer: string,
  readiness: ServeReadiness
): Promise<OpenkododTunnelIdentity> {
  const offer = parsePairingCode(pairingOffer)
  return offer
    ? verifyOpenkododPairingIdentity(pairedRuntimeConnectionFromOffer(offer), {
        runtimeId: readiness.runtimeId || null
      })
    : {
        verdict: 'foreign',
        detail: 'The OpenKodo server in WSL published an invalid pairing offer.'
      }
}
