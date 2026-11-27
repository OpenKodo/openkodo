import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from '../../search/settings-search-keywords'

export const getOpenKodoAccountSettingsSearchEntries = createLocalizedCatalog(() => [
  {
    title: translate('auto.components.settings.openkodoAccount.account', 'OpenKodo account'),
    description: translate(
      'auto.components.settings.openkodoAccount.searchDescription',
      'Sign in or out of the account used by Artifacts and relay.'
    ),
    keywords: [
      ...translateSearchKeyword(
        'auto.components.settings.openkodoAccount.keywordAccount',
        'account'
      ),
      ...translateSearchKeyword('auto.components.settings.openkodoAccount.keywordLogin', 'login'),
      ...translateSearchKeyword('auto.components.settings.openkodoAccount.keywordLogout', 'logout'),
      ...translateSearchKeyword(
        'auto.components.settings.openkodoAccount.keywordSignIn',
        'sign in'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.openkodoAccount.keywordSignOut',
        'sign out'
      ),
      ...translateSearchKeyword('auto.components.settings.openkodoAccount.keywordRelay', 'relay'),
      ...translateSearchKeyword('auto.components.settings.openkodoAccount.keywordCloud', 'cloud')
    ]
  }
])
