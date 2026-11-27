import { useTranslate } from '@/i18n/use-translate'
import { useRequiredPluginFailures } from '@/store/plugins/updates/required-plugin-failures'
import { useAppStore } from '@/store/index'
import { getOpenKodoCloudTeamCapabilities } from '../../../../../shared/openkodo-profiles/openkodo-cloud-team-policy'
import { PluginWarningBanner } from '../review/PluginWarningBanner'

export function RequiredPluginWarnings(): React.JSX.Element | null {
  const t = useTranslate()
  const pluginKeys = useRequiredPluginFailures((state) => state.pluginKeys)
  const required = useAppStore(
    (state) =>
      getOpenKodoCloudTeamCapabilities(state.openkodoProfileAuthStatus)?.teamPolicy?.requiredPlugins
  )
  const failures = pluginKeys.filter((key) => required?.includes(key))
  if (failures.length === 0) {
    return null
  }
  return (
    <div className="space-y-2">
      {failures.map((pluginKey) => (
        <PluginWarningBanner
          key={pluginKey}
          label={t('plugins.requiredFailures.label', 'Required by your team')}
          body={t('plugins.requiredFailures.body', 'OpenKodo couldn’t install {{plugin}}.', {
            plugin: pluginKey
          })}
        />
      ))}
    </div>
  )
}
