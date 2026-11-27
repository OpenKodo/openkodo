import { describe, expect, it } from 'vitest'
import type { OpenKodoProfileCloudSummary } from '../../../../shared/openkodo-profiles/openkodo-profiles'
import { appRailAccount } from './AppRailAccountMenu'

const CLOUD: OpenKodoProfileCloudSummary = {
  cloudProfileId: 'c1',
  userId: 'u1',
  email: 'alex@example.com',
  displayName: 'Alex Chen',
  linkedAt: 1
}

describe('appRailAccount', () => {
  it('prefers the display name, then the email, then the fallback', () => {
    expect(appRailAccount(CLOUD, 'OpenKodo account')).toEqual({
      name: 'Alex Chen',
      email: 'alex@example.com',
      initial: 'A'
    })
    expect(appRailAccount({ ...CLOUD, displayName: '  ' }, 'OpenKodo account').name).toBe(
      'alex@example.com'
    )
    expect(appRailAccount(undefined, 'OpenKodo account')).toEqual({
      name: 'OpenKodo account',
      email: undefined,
      initial: 'O'
    })
  })
})
