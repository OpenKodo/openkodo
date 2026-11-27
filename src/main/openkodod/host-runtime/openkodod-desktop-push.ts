import process from 'node:process'
import { getAppEnvironment } from '../../../shared/app-lifecycle/app-environment'
import { DesktopPushService } from '../../runtime/push/desktop-push-service'
import { resolvePushGatewayOrigin } from '../../runtime/push/push-gateway-origin'
import type { OpenKodoRuntimeService } from '../../runtime/openkodo-runtime'
import type { OpenKodoRuntimeRpcServer } from '../../runtime/rpc/server/runtime-rpc'

/** Phones register push tokens with this host; the service stops when openkodod quits. */
export function startOpenkododDesktopPushService(
  runtime: OpenKodoRuntimeService,
  runtimeRpc: OpenKodoRuntimeRpcServer
): void {
  const pushService = DesktopPushService.create({
    runtime,
    runtimeRpc,
    gatewayUrl: resolvePushGatewayOrigin(process.env, getAppEnvironment().isPackaged())
  })
  pushService?.start()
  getAppEnvironment().onWillQuit(() => pushService?.stop())
}
