import type React from 'react'
import { Trans } from 'react-i18next'
import type { OpenKodoUninstallPlan } from '../../../../../../shared/uninstall/openkodo-uninstall-types'
import { i18n } from '@/i18n/i18n'
import { useIntlLocale, useTranslate, type Translate } from '@/i18n/use-translate'
import { SettingsGroupDisclosure } from '../../section-layout/SettingsGroupDisclosure'
import {
  countOpenKodoUninstallPendingKept,
  countOpenKodoUninstallProblems
} from './openkodo-uninstall-plan-state'
import { OpenKodoUninstallFooter } from './OpenKodoUninstallFooter'
import {
  describeOpenKodoUninstallHookTargets,
  OpenKodoUninstallRows
} from './OpenKodoUninstallRows'
import { useOpenKodoUninstall, type OpenKodoUninstallModel } from './use-openkodo-uninstall'

// Parts are joined by Intl.ListFormat, so each one is a lowercase fragment.
function describePlanParts(plan: OpenKodoUninstallPlan, t: Translate, intlLocale: string): string {
  const parts: string[] = []
  const hookTargets = describeOpenKodoUninstallHookTargets(plan, t, intlLocale)
  if (hookTargets) {
    parts.push(
      t('settings.uninstall.summary.hooksIn', 'hooks in {{targets}}', { targets: hookTargets })
    )
  }
  if (plan.cliCommand) {
    parts.push(
      t('settings.uninstall.summary.cliCommand', 'the <cmd>{{name}}</cmd> CLI', {
        name: plan.cliCommand.commandName
      })
    )
  }
  if (plan.backgroundService) {
    parts.push(t('settings.uninstall.summary.service', 'the <cmd>openkodo serve</cmd> server'))
  }
  if (plan.terminalDaemon) {
    parts.push(t('settings.uninstall.summary.terminalDaemon', 'the terminal background process'))
  }
  // Scripts are part of the hooks; name them only when no agent or host entry is left.
  if (plan.hookScripts && !hookTargets) {
    parts.push(t('settings.uninstall.summary.hookScripts', 'hook scripts'))
  }
  if (parts.length === 0) {
    return t('settings.uninstall.summary.nothing', 'Nothing outside the app to remove.')
  }
  const list = new Intl.ListFormat(intlLocale, { type: 'conjunction' }).format(parts)
  return `${list.charAt(0).toLocaleUpperCase(intlLocale)}${list.slice(1)}.`
}

function OpenKodoUninstallSummary({
  model
}: {
  model: Pick<OpenKodoUninstallModel, 'plan' | 'loadFailed' | 'phase'>
}): React.JSX.Element {
  const t = useTranslate()
  const intlLocale = useIntlLocale()
  const { plan } = model
  if (!plan) {
    return (
      <>
        {model.loadFailed
          ? t('settings.uninstall.loadFailed', 'OpenKodo could not check what it installed.')
          : t('settings.uninstall.summary.loading', 'Checking what OpenKodo installed…')}
      </>
    )
  }
  if (model.phase === 'done') {
    const problems = countOpenKodoUninstallProblems(plan)
    if (problems === 0 && countOpenKodoUninstallPendingKept(plan) > 0) {
      return (
        <>
          {t(
            'settings.uninstall.summary.stillInUse',
            'Some OpenKodo files are still in use, so they stay for now.'
          )}
        </>
      )
    }
    return (
      <>
        {problems === 0
          ? t('settings.uninstall.summary.done', 'Removed. Delete the app to finish.')
          : t(
              'settings.uninstall.summary.problems',
              '{{count}} items need you before you delete the app.',
              {
                count: problems,
                defaultValue_one: '1 item needs you before you delete the app.'
              }
            )}
      </>
    )
  }
  return (
    <Trans
      i18n={i18n}
      defaults={describePlanParts(plan, t, intlLocale)}
      components={{ cmd: <code className="font-mono" /> }}
    />
  )
}

/** The disclosure is the confirmation: expanding it lists every part before Uninstall is reachable. */
export function OpenKodoUninstallPanel({
  model
}: {
  model: OpenKodoUninstallModel
}): React.JSX.Element {
  const t = useTranslate()
  return (
    <SettingsGroupDisclosure
      label={t('settings.uninstall.title', 'Uninstall OpenKodo')}
      summary={<OpenKodoUninstallSummary model={model} />}
    >
      <div className="divide-y divide-border border-t border-border">
        <OpenKodoUninstallRows model={model} />
        <OpenKodoUninstallFooter model={model} />
      </div>
    </SettingsGroupDisclosure>
  )
}

export function OpenKodoUninstallSection(): React.JSX.Element {
  return <OpenKodoUninstallPanel model={useOpenKodoUninstall()} />
}
