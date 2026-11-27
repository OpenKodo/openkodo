import { getOpenKodoPushGatewayUrl } from '../../openkodo-profiles/cloud-auth/profile-cloud-auth-config'
import { DesktopPushService } from '../../runtime/push/desktop-push-service'
import { executionHostPushCoverage } from '../../notifications/execution-host-push-coverage'
import type { OpenKodoRuntimeService } from '../../runtime/openkodo-runtime'
import type { OpenKodoRuntimeRpcServer } from '../../runtime/rpc/server/runtime-rpc'
import { mainProcessState as state } from '../main-process-state'

// Push authenticates by host keypair, so accountless hosts must register phones too; shared startup state supplies the runtime in both modes.
export function startDesktopPushService(runtimeRpc: OpenKodoRuntimeRpcServer): void {
  const runtime: OpenKodoRuntimeService | null = state.core.runtime
  if (!runtime) {
    console.warn('[push] Background push startup skipped: runtime not started')
    return
  }
  try {
    const pushService = DesktopPushService.create({
      runtime,
      runtimeRpc,
      gatewayUrl: getOpenKodoPushGatewayUrl(),
      coverage: executionHostPushCoverage
    })
    pushService?.start()
    state.core.desktopPushService = pushService
  } catch (error) {
    console.warn(
      '[push] Background push startup unavailable:',
      error instanceof Error ? error.message : String(error)
    )
  }
}
