import type React from 'react'
import { useMemo } from 'react'
import { Monitor } from 'lucide-react'
import type { OpenKodoUninstallHostEntry } from '../../../../../../shared/uninstall/openkodo-uninstall-types'
import { cn } from '@/lib/class-names'
import { useTranslate } from '@/i18n/use-translate'
import { Badge } from '../../../ui/badge'
import { Button } from '../../../ui/button'
import { useBoundedHostRows } from '../../../host-picker/use-bounded-host-rows'
import { HostListSearchField } from '../../../host-picker/HostListSearchField'
import { HostListOverflowNote } from '../../../host-picker/HostListOverflowNote'
import { isOpenKodoUninstallProblem } from './openkodo-uninstall-plan-state'
import { getOpenKodoUninstallSlotKind } from './OpenKodoUninstallStatus'
import { PATH_CLASS, SUB_ROW_CLASS, SubRowSlot, type RowsModel } from './OpenKodoUninstallRowLayout'
import { openkodoUninstallRetryKey } from './use-openkodo-uninstall'

/** Sub-rows of the hooks row: on a host, uninstall only turns that host's agent hooks off. */
export function OpenKodoUninstallHostSubRows({
  model
}: {
  model: RowsModel
}): React.JSX.Element | null {
  const hosts = useMemo(() => model.plan?.hosts ?? [], [model.plan])
  const hostRows = useMemo(
    () => hosts.map((entry) => ({ id: entry.hostId, label: entry.label, entry })),
    [hosts]
  )
  // Problem hosts stay in view however many hosts are configured.
  const problemIds = useMemo(
    () =>
      new Set(
        hosts
          .filter((entry) => isOpenKodoUninstallProblem(entry.state))
          .map((entry) => entry.hostId)
      ),
    [hosts]
  )
  const rows = useBoundedHostRows(hostRows, problemIds)
  if (hosts.length === 0) {
    return null
  }
  return (
    <>
      {rows.searchable ? <HostListSearchField value={rows.query} onChange={rows.setQuery} /> : null}
      {rows.shown.map((row) => (
        <HostSubRow key={row.id} model={model} entry={row.entry} />
      ))}
      <HostListOverflowNote hiddenCount={rows.hiddenCount} />
    </>
  )
}

function HostSubRow({
  model,
  entry
}: {
  model: RowsModel
  entry: OpenKodoUninstallHostEntry
}): React.JSX.Element {
  const t = useTranslate()
  const running =
    (model.runningStep === 'ssh-hosts' && entry.state === 'present') ||
    model.retrying.has(openkodoUninstallRetryKey('ssh-hosts', entry.hostId))
  const kind = getOpenKodoUninstallSlotKind([entry.state], running)
  const canRetry = model.phase === 'done' && isOpenKodoUninstallProblem(entry.state)
  const action = canRetry ? (
    <Button
      variant="outline"
      size="xs"
      onClick={() => model.retry({ step: 'ssh-hosts', only: [entry.hostId] })}
    >
      {t('settings.uninstall.retry', 'Retry')}
    </Button>
  ) : null
  return (
    <div className={SUB_ROW_CLASS}>
      <Monitor className="size-3.5 text-muted-foreground" />
      <span className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="min-w-0 break-words">{entry.label}</span>
        <Badge variant="hostContext">{t('settings.uninstall.host.ssh', 'SSH')}</Badge>
      </span>
      <span className={cn(PATH_CLASS, 'font-sans')}>
        {entry.connected
          ? t('settings.uninstall.host.connected', 'Connected')
          : canRetry
            ? t(
                'settings.uninstall.host.notConnectedRetry',
                'Not connected. Connect this host, then Retry.'
              )
            : t('settings.uninstall.host.notConnected', 'Not connected.')}
      </span>
      <SubRowSlot
        kind={model.phase === 'idle' ? 'blank' : kind}
        detail={entry.detail}
        action={action}
      />
    </div>
  )
}
