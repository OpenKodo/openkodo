import { translate } from '@/i18n/i18n'
import type { Translate } from '@/i18n/use-translate'

export type ResourceOwnerKey = 'openkodo' | 'agents' | 'yourProcesses'

export function resourceOwnerLabels(t: Translate = translate): Record<ResourceOwnerKey, string> {
  return {
    openkodo: t('resourceManager.owner.openkodo', 'OpenKodo'),
    agents: t('resourceManager.owner.agents', 'Agents'),
    yourProcesses: t('resourceManager.owner.otherTerminals', 'Other terminals')
  }
}
