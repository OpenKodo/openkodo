import { refreshManagedOpenkododPairing } from '../../../shared/remote-runtime/host-store/runtime-environment-managed-openkodod-store'
import { resolveEnvironment } from '../../../shared/remote-runtime/host-store/runtime-environment-store'
import {
  getOpenkododSshDeployment,
  getPreferredPairingOffer,
  type KnownRuntimeEnvironment
} from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import type { ServeReadiness } from '../../server/serve-readiness'
import { tunneledOpenkododPairingCode } from './openkodod-tunneled-pairing'

/** Saves the pairing a managed server published after an update, rollback or restart. */
export async function refreshMaintainedOpenkododPairing(
  userDataPath: string,
  environmentId: string,
  readiness: ServeReadiness
): Promise<KnownRuntimeEnvironment> {
  // Reuse the enrolled grant after restart so pairing cannot replace this desktop’s identity (#29042).
  // Re-read because census may have repaired pairing or moved the tunnel port meanwhile.
  const current = await resolveEnvironment(userDataPath, environmentId)
  const localPort = getOpenkododSshDeployment(current)?.localPort
  if (localPort === undefined) {
    throw new Error('This server is no longer managed over SSH.')
  }
  const enrolled = getPreferredPairingOffer(current)
  const pairingCode = tunneledOpenkododPairingCode(readiness, localPort, enrolled)
  return await refreshManagedOpenkododPairing(userDataPath, environmentId, pairingCode)
}
