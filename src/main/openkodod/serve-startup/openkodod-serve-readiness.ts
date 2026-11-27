import type { ServeReadiness } from '../../server/serve-readiness'
import type { OpenKodoRuntimeRpcServer } from '../../runtime/rpc/server/runtime-rpc'
import { buildServePairingReadiness } from '../../server/serve-pairing-readiness'
import type { OpenkododHealth } from '../diagnostics/openkodod-health'
import type { OpenkododOptions } from './openkodod-start-contract'

export async function buildOpenkododServeReadiness(input: {
  options: OpenkododOptions
  runtimeId: string
  rpc: Pick<OpenKodoRuntimeRpcServer, 'getWebSocketEndpoint' | 'createPairingOffer'>
  collectHealth: () => Promise<OpenkododHealth>
}): Promise<ServeReadiness> {
  return {
    runtimeId: input.runtimeId,
    ...(await buildServePairingReadiness(input.options, input.rpc)),
    // WSL CLI reconciliation runs only in desktop launch, so no repair is pending here.
    managedWslCliReconciliation: 'settled',
    // Deployers inspect readiness health to reject hosts whose terminal daemon is unavailable.
    health: await input.collectHealth()
  }
}
