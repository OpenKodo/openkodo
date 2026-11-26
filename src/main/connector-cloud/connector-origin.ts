import { cleanCloudServiceOrigin } from '../../shared/network/cloud-service-url'

// The connector's canonical host. connector.onopenkodo.dev still serves the same service, so released
// desktops that default to it keep working.
export const DEFAULT_CONNECTOR_ORIGIN = 'https://connector.openkodo.dev'

export function resolveConnectorOrigin(env: NodeJS.ProcessEnv, packaged: boolean): string {
  return cleanCloudServiceOrigin(env.OPENKODO_CONNECTOR_URL, !packaged) ?? DEFAULT_CONNECTOR_ORIGIN
}
