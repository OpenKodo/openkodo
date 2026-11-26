import { cleanCloudServiceOrigin } from '../../../shared/network/cloud-service-url'

export function resolvePushGatewayOrigin(env: NodeJS.ProcessEnv, packaged: boolean): string {
  return cleanCloudServiceOrigin(env.OPENKODO_PUSH_GATEWAY_URL, !packaged) ?? ''
}
