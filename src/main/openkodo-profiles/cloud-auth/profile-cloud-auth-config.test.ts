import { afterEach, describe, expect, it } from 'vitest'
import { installFakeAppEnvironment } from '../../../../config/scripts/test-runtime/environment/vitest-host-ports-setup'
import { hasAppEnvironment } from '../../../shared/app-lifecycle/app-environment'
import {
  allowsPlaintextOpenKodoCloudSession,
  getOpenKodoCloudAuthConfig,
  getOpenKodoPushGatewayUrl,
  isOpenKodoCloudDevAuthEnabled
} from './profile-cloud-auth-config'

const DEV_OVERRIDES = {
  OPENKODO_CLOUD_API_URL: 'http://127.0.0.1:8787',
  OPENKODO_CLOUD_CLIENT_ID: 'local-client',
  OPENKODO_CLOUD_DEV_AUTH: '1',
  OPENKODO_CLOUD_ALLOW_PLAINTEXT_SESSION: '1'
}

describe('OpenKodo cloud auth config read from the installed app environment', () => {
  afterEach(() => installFakeAppEnvironment())

  it('refuses dev auth, plaintext sessions and HTTP endpoints in a packaged host', () => {
    installFakeAppEnvironment({ isPackaged: () => true })

    expect(isOpenKodoCloudDevAuthEnabled(DEV_OVERRIDES)).toBe(false)
    expect(allowsPlaintextOpenKodoCloudSession(DEV_OVERRIDES)).toBe(false)
    expect(getOpenKodoCloudAuthConfig(DEV_OVERRIDES)).toEqual({
      configured: false,
      setupMessage: 'Cloud accounts are not available in this build.'
    })
    expect(getOpenKodoPushGatewayUrl({ OPENKODO_PUSH_GATEWAY_URL: 'http://127.0.0.1:9000' })).toBe(
      ''
    )
    expect(getOpenKodoCloudAuthConfig({})).toEqual({
      configured: false,
      setupMessage: 'Cloud accounts are not available in this build.'
    })
  })

  it('allows the dev overrides in an unpackaged host', () => {
    installFakeAppEnvironment({ isPackaged: () => false })

    expect(isOpenKodoCloudDevAuthEnabled(DEV_OVERRIDES)).toBe(true)
    expect(allowsPlaintextOpenKodoCloudSession(DEV_OVERRIDES)).toBe(true)
    expect(getOpenKodoCloudAuthConfig(DEV_OVERRIDES)).toMatchObject({
      configured: true,
      config: { apiBaseUrl: 'http://127.0.0.1:8787', clientId: 'local-client' }
    })
    expect(getOpenKodoCloudAuthConfig({})).toMatchObject({ configured: false })
  })

  it('reads as unpackaged when no app environment is installed, as a bare Node import did', () => {
    // Test setup installs a fake environment, and there is no uninstall API.
    Reflect.deleteProperty(globalThis, Symbol.for('openkodo.host.appEnvironment'))
    expect(hasAppEnvironment()).toBe(false)

    expect(isOpenKodoCloudDevAuthEnabled(DEV_OVERRIDES)).toBe(true)
    expect(getOpenKodoCloudAuthConfig({})).toMatchObject({ configured: false })
  })
})
