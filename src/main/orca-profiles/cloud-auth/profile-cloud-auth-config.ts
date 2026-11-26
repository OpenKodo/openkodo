import {
  cleanCloudServiceUrl as cleanUrl,
  cleanCloudServiceOrigin as cleanOrigin
} from '../../../shared/network/cloud-service-url'
import { resolvePushGatewayOrigin } from '../../runtime/push/push-gateway-origin'
import { getAppEnvironment, hasAppEnvironment } from '../../../shared/app-lifecycle/app-environment'

export type OrcaCloudAuthConfig = {
  apiBaseUrl: string
  authorizeEndpoint: string
  sessionEndpoint: string
  refreshEndpoint: string
  capabilitiesEndpoint: string
  profileEndpoint: string
  orgEndpoint: string
  logoutEndpoint: string
  relayTokenEndpoint: string
  connectorTokenEndpoint: string
  relayDirectorUrl: string
  clientId: string
  scope: string
}

const DEFAULT_SCOPE = 'openid profile email offline_access'
const PRODUCTION_API_BASE_URL = ''
const PRODUCTION_CLIENT_ID = 'openkodo-desktop'
const PRODUCTION_RELAY_DIRECTOR_URL = ''

// Packaged main omits NODE_ENV; use packaged status to gate development auth overrides.
// No installed environment (a bare Node import) reads as unpackaged, as Electron's absent `app` did.
export function isPackagedOrcaBuild(): boolean {
  return hasAppEnvironment() && getAppEnvironment().isPackaged()
}

function endpoint(baseUrl: string, path: string): string {
  return new URL(path, `${baseUrl}/`).toString()
}

export function getOrcaCloudAuthConfig(
  env: NodeJS.ProcessEnv = process.env,
  packaged: boolean = isPackagedOrcaBuild()
): { configured: true; config: OrcaCloudAuthConfig } | { configured: false; setupMessage: string } {
  // Plain HTTP token endpoints are development-only.
  const allowLoopbackHttp = !packaged
  const cleanEndpointUrl = (value: string | undefined): string | null =>
    cleanUrl(value, allowLoopbackHttp)
  const configuredApiBaseUrl = env.OPENKODO_CLOUD_API_URL?.trim()
  // Packaged builds need defaults; first-party endpoints and public client IDs are not secrets.
  const apiBaseUrl = configuredApiBaseUrl
    ? cleanEndpointUrl(configuredApiBaseUrl)
    : packaged
      ? PRODUCTION_API_BASE_URL
      : null
  const clientId =
    env.OPENKODO_CLOUD_CLIENT_ID?.trim() || (packaged ? PRODUCTION_CLIENT_ID : undefined)
  if (!apiBaseUrl || !clientId) {
    return {
      configured: false,
      setupMessage: 'Cloud accounts are not available in this build.'
    }
  }

  const authBaseUrl = cleanEndpointUrl(env.OPENKODO_CLOUD_AUTH_URL) ?? apiBaseUrl
  return {
    configured: true,
    config: {
      apiBaseUrl,
      authorizeEndpoint:
        cleanEndpointUrl(env.OPENKODO_CLOUD_AUTHORIZE_URL) ??
        endpoint(authBaseUrl, '/v1/desktop/auth/authorize'),
      sessionEndpoint:
        cleanEndpointUrl(env.OPENKODO_CLOUD_SESSION_URL) ??
        endpoint(apiBaseUrl, '/v1/desktop/auth/session'),
      refreshEndpoint:
        cleanEndpointUrl(env.OPENKODO_CLOUD_REFRESH_URL) ??
        endpoint(apiBaseUrl, '/v1/desktop/auth/refresh'),
      capabilitiesEndpoint:
        cleanEndpointUrl(env.OPENKODO_CLOUD_CAPABILITIES_URL) ??
        endpoint(apiBaseUrl, '/v1/desktop/auth/capabilities'),
      profileEndpoint:
        cleanEndpointUrl(env.OPENKODO_CLOUD_PROFILE_URL) ??
        endpoint(apiBaseUrl, '/v1/desktop/auth/profile'),
      orgEndpoint:
        cleanEndpointUrl(env.OPENKODO_CLOUD_ORG_URL) ??
        endpoint(apiBaseUrl, '/v1/desktop/auth/org'),
      logoutEndpoint:
        cleanEndpointUrl(env.OPENKODO_CLOUD_LOGOUT_URL) ??
        endpoint(apiBaseUrl, '/v1/desktop/auth/logout'),
      relayTokenEndpoint:
        cleanEndpointUrl(env.OPENKODO_CLOUD_RELAY_TOKEN_URL) ??
        endpoint(apiBaseUrl, '/v1/desktop/auth/relay-token'),
      connectorTokenEndpoint:
        cleanEndpointUrl(env.OPENKODO_CLOUD_CONNECTOR_TOKEN_URL) ??
        endpoint(apiBaseUrl, '/v1/desktop/auth/connector-token'),
      relayDirectorUrl:
        cleanOrigin(env.OPENKODO_RELAY_URL, allowLoopbackHttp) ?? PRODUCTION_RELAY_DIRECTOR_URL,
      clientId,
      scope: env.OPENKODO_CLOUD_AUTH_SCOPE?.trim() || DEFAULT_SCOPE
    }
  }
}

/** Host-key authentication keeps phone push available without a signed-in account. */
export function getOrcaPushGatewayUrl(
  env: NodeJS.ProcessEnv = process.env,
  packaged: boolean = isPackagedOrcaBuild()
): string {
  return resolvePushGatewayOrigin(env, packaged)
}

export function allowsPlaintextOrcaCloudSession(
  env: NodeJS.ProcessEnv = process.env,
  packaged: boolean = isPackagedOrcaBuild()
): boolean {
  return (
    env.OPENKODO_CLOUD_ALLOW_PLAINTEXT_SESSION === '1' && env.NODE_ENV !== 'production' && !packaged
  )
}

export function isOrcaCloudDevAuthEnabled(
  env: NodeJS.ProcessEnv = process.env,
  packaged: boolean = isPackagedOrcaBuild()
): boolean {
  return env.OPENKODO_CLOUD_DEV_AUTH === '1' && env.NODE_ENV !== 'production' && !packaged
}
