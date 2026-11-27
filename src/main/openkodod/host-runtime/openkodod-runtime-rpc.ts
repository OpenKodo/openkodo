import { OpenKodoRuntimeRpcServer } from '../../runtime/rpc/server/runtime-rpc'
import type { OpenKodoRuntimeService } from '../../runtime/openkodo-runtime'
import type { OpenkododOptions } from '../serve-startup/openkodod-start-contract'
import { resolveOpenkododWebClientRoot } from '../serve-startup/openkodod-command-arguments'
import {
  clearDesktopRuntimeFallbackPort,
  openkododWsPortOptions
} from '../serve-startup/openkodod-ws-port-policy'

export function createOpenkododRuntimeRpcServer(
  runtime: OpenKodoRuntimeService,
  userDataPath: string,
  options: OpenkododOptions,
  bindHost: string
): OpenKodoRuntimeRpcServer {
  clearDesktopRuntimeFallbackPort(userDataPath)
  return new OpenKodoRuntimeRpcServer({
    runtime,
    userDataPath,
    enableWebSocket: true,
    // Pin operator exposure across restarts; pairing must not silently widen a loopback bind.
    pinnedBindHost: bindHost,
    serveNetworkSources: {
      allowPublic: options.allowPublic === true,
      refusePublic: options.refusePublic === true,
      pairingAddress: options.pairingAddress ?? null
    },
    webClientRoot: resolveOpenkododWebClientRoot(options.webClientRoot),
    ...openkododWsPortOptions(options.port)
  })
}
