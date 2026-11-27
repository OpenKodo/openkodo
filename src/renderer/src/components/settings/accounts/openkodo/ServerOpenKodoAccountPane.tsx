// Settings › OpenKodo Account with a server picked: the account that server runs as, and its sign-in.
import { useTranslate } from '@/i18n/use-translate'
import {
  useBotHostOpenKodoAccount,
  useBotHostOpenKodoAccountSettled
} from '@/lib/bot-host-openkodo-account'
import { useHostBots } from '@/lib/bot-catalog'
import { BotHostSignInControl } from '../../../bots/BotConnectorsHostNotice'
import { useBotHostLabel } from '../../../bots/use-bot-host-label'
import { toRuntimeExecutionHostId } from '../../../../../../shared/execution-host/execution-host'
import type { OpenKodoAccountServerStatus } from '../../../../../../shared/openkodo-account-server-sign-in'
import { accountStatusCopy, OpenKodoAccountHeader } from './OpenKodoAccountSettingsPane'

const PROFILE_STATE = {
  'signed-in': 'connected',
  'signed-out': 'local',
  'reconnect-required': 'reconnect-required',
  unconfigured: 'unconfigured'
} as const satisfies Record<OpenKodoAccountServerStatus['state'], string>

export function ServerOpenKodoAccountPane({
  environmentId
}: {
  environmentId: string
}): React.JSX.Element {
  const t = useTranslate()
  const hostId = toRuntimeExecutionHostId(environmentId)
  const host =
    useBotHostLabel(hostId) ??
    t('components.settings.notifications.server.fallbackHost', 'this server')
  const account = useBotHostOpenKodoAccount(hostId)
  const settled = useBotHostOpenKodoAccountSettled(hostId)
  // The sign-in page opens in one of the server's bot workspaces, so a server with none signs in there.
  const hasBots = useHostBots(hostId).length > 0
  const cantSave =
    account && account.state !== 'signed-in' && account.storage.kind === 'refused'
      ? account.storage.reason
      : null
  const line = !account
    ? settled
      ? t(
          'components.settings.openkodoAccount.server.unread',
          'Can’t read {{host}}’s OpenKodo account. Update or reconnect {{host}}.',
          { host }
        )
      : accountStatusCopy(undefined, undefined, t)
    : cantSave !== null
      ? t('bots.host.notice.cantSave', '{{host}} can’t save an OpenKodo sign-in: {{reason}}', {
          host,
          reason: cantSave
        })
      : accountStatusCopy(PROFILE_STATE[account.state], account.email, t)
  const canSignIn =
    cantSave === null &&
    (account?.state === 'signed-out' || account?.state === 'reconnect-required')
  return (
    <OpenKodoAccountHeader
      name={account?.displayName}
      connected={account?.state === 'signed-in'}
      line={line}
    >
      {canSignIn && hasBots ? (
        <BotHostSignInControl
          hostId={hostId}
          host={host}
          bot={null}
          label={
            account.state === 'signed-out'
              ? t('bots.host.signIn.start', 'Sign in on {{host}}', { host })
              : t('bots.host.signIn.again', 'Sign {{host}} in again', { host })
          }
          firstSignIn={account.state === 'signed-out'}
        />
      ) : canSignIn ? (
        <p className="basis-full text-xs text-muted-foreground">
          {t(
            'components.settings.openkodoAccount.server.signInThere',
            'Run `openkodo auth login` on {{host}} to sign it in.',
            { host }
          )}
        </p>
      ) : null}
    </OpenKodoAccountHeader>
  )
}
