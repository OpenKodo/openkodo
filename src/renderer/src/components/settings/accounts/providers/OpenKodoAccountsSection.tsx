import { useEffect, useState } from 'react'
import { useTranslate } from '../../../../i18n/use-translate'
import { Button } from '../../../ui/button'
import { SettingsGroup } from '../../section-layout/SettingsGroup'

type LoginState =
  | { status: 'idle' }
  | { status: 'pending'; userCode: string; verificationUri: string; expiresAt: number }
  | { status: 'browser'; verificationUri: string }
  | { status: 'connected'; email: string; plan: string; openCodePath: string }
  | { status: 'expired' | 'error'; message: string }

type Usage = {
  email?: string
  cost_5h_micros: number
  cost_7d_micros: number
  credits_remaining_micros: number
  credits_per_5h_micros: number
  credits_per_week_micros: number
  credits_included_micros: number
}

const usd = (micros: number): string => `$${(micros / 1_000_000).toFixed(2)}`

function Meter({
  label,
  used,
  cap
}: {
  label: string
  used: number
  cap: number
}): React.JSX.Element {
  const pct = cap > 0 ? Math.min(100, (used / cap) * 100) : 0
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono">
          {usd(used)} / {usd(cap)}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        <div className="h-full rounded-full bg-foreground/70" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// Sign-in runs in the main process; this pane only shows the code and polls.
export function OpenKodoAccountsSection(): React.JSX.Element {
  const t = useTranslate()
  const [connected, setConnected] = useState(false)
  const [login, setLogin] = useState<LoginState>({ status: 'idle' })
  const [usage, setUsage] = useState<Usage | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = async (): Promise<void> => {
    const status = await window.api.openkodo.status()
    setConnected(status.connected)
    setLogin(status.login)
    setUsage(status.connected ? await window.api.openkodo.usage() : null)
  }

  useEffect(() => {
    void refresh()
  }, [])

  useEffect(() => {
    if (login.status !== 'pending' && login.status !== 'browser') {
      return
    }
    const timer = window.setInterval(async () => {
      const next = await window.api.openkodo.loginState()
      setLogin(next)
      if (next.status !== 'pending') {
        window.clearInterval(timer)
        await refresh()
      }
    }, 2000)
    return () => window.clearInterval(timer)
  }, [login.status])

  const connect = async (mode: 'browser' | 'code' = 'browser'): Promise<void> => {
    setBusy(true)
    const started =
      mode === 'browser' ? window.api.openkodo.loginBrowser() : window.api.openkodo.loginStart()
    setLogin(await started.finally(() => setBusy(false)))
  }

  const disconnect = async (): Promise<void> => {
    await window.api.openkodo.logout()
    await refresh()
  }

  const body = (): React.JSX.Element => {
    if (connected) {
      return (
        <div className="space-y-3 py-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {t('auto.components.settings.OpenKodo.account', 'Account')}
            </span>
            <span className="font-mono text-xs">
              {usage?.email ?? (login.status === 'connected' ? login.email : '')}
            </span>
          </div>
          {usage && (
            <div className="space-y-2 pt-1">
              <Meter
                label={t('auto.components.settings.OpenKodo.last5h', 'Last 5 hours')}
                used={usage.cost_5h_micros}
                cap={usage.credits_per_5h_micros}
              />
              <Meter
                label={t('auto.components.settings.OpenKodo.last7d', 'Last 7 days')}
                used={usage.cost_7d_micros}
                cap={usage.credits_per_week_micros}
              />
              <Meter
                label={t('auto.components.settings.OpenKodo.thisMonth', 'This month')}
                used={Math.max(0, usage.credits_included_micros - usage.credits_remaining_micros)}
                cap={usage.credits_included_micros}
              />
            </div>
          )}
          {login.status === 'connected' && login.openCodePath ? (
            <p className="text-xs text-muted-foreground">
              {t('auto.components.settings.OpenKodo.writtenTo', 'OpenCode provider written to')}{' '}
              <code>{login.openCodePath}</code>
            </p>
          ) : null}
          <div className="flex gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => void refresh()}>
              {t('auto.components.settings.OpenKodo.refresh', 'Refresh')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void disconnect()}>
              {t('auto.components.settings.OpenKodo.disconnect', 'Disconnect')}
            </Button>
          </div>
        </div>
      )
    }
    if (login.status === 'browser') {
      return (
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            {t(
              'auto.components.settings.OpenKodo.finishInBrowser',
              'Finish signing in in your browser. This window updates on its own.'
            )}
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => void window.api.shell.openUrl(login.verificationUri)}>
              {t('auto.components.settings.OpenKodo.openBrowser', 'Open browser')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void refresh()}>
              {t('auto.components.settings.OpenKodo.approved', 'I approved it')}
            </Button>
          </div>
        </div>
      )
    }
    if (login.status === 'pending') {
      return (
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            {t(
              'auto.components.settings.OpenKodo.enterCode',
              'Enter this code at openkodo.dev/activate. The browser should have opened already.'
            )}
          </p>
          <div className="rounded-md border border-black/10 px-4 py-3 text-center font-mono text-2xl tracking-[0.2em] dark:border-white/10">
            {login.userCode}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => void window.api.shell.openUrl(login.verificationUri)}>
              {t('auto.components.settings.OpenKodo.openBrowser', 'Open browser')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void refresh()}>
              {t('auto.components.settings.OpenKodo.approved', 'I approved it')}
            </Button>
          </div>
        </div>
      )
    }
    return (
      <div className="space-y-2 py-2">
        {login.status === 'expired' || login.status === 'error' ? (
          <p className="text-sm text-destructive">
            {'message' in login
              ? login.message
              : t('auto.components.settings.OpenKodo.failed', 'Sign-in failed.')}
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          {t(
            'auto.components.settings.OpenKodo.connectHint',
            'Sign in with your OpenKodo account. The app creates a key for this device and fills in the model provider for you.'
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={() => void connect('browser')}>
            {busy
              ? t('auto.components.settings.OpenKodo.starting', 'Starting…')
              : t('auto.components.settings.OpenKodo.connectBrowser', 'Continue in browser')}
          </Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void connect('code')}>
            {t('auto.components.settings.OpenKodo.useCode', 'Use a device code')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div key="openkodo" id="accounts-openkodo" className="scroll-mt-6">
      <SettingsGroup
        title={t('auto.components.settings.OpenKodo.title', 'OpenKodo')}
        description={t(
          'auto.components.settings.OpenKodo.description',
          'Your OpenKodo subscription, connected to this app.'
        )}
      >
        {body()}
      </SettingsGroup>
    </div>
  )
}
