import { getAppEnvironment } from '../../shared/app-lifecycle/app-environment'
import { botAccountSwitchBlocker } from '../bots/bot-account-switch-blocker'
import { OpenKodoAccountService } from '../openkodo-profiles/openkodo-account-service'
import { flushUnsavedCloudSessions } from '../openkodo-profiles/cloud-session/profile-cloud-session-owner'
import {
  installOpenKodoServerSignIn,
  OpenKodoServerSignIn
} from '../openkodo-profiles/openkodo-server-sign-in'
import { GoogleConnect, installGoogleConnect } from '../google/google-connect'
import type { BotController } from '../bots/bot-controller'
import type { ConnectorCloud } from '../connector-cloud/connector-cloud'
import type { OpenkododRelay } from './openkodod-relay'
import type { BackendServiceCleanup } from '../backend/service-composition'
import { openkododServedProfileId } from './openkodod-served-profile'
import type * as OpenkododConnector from './openkodod-connector'
import { scheduleTeamPolicyRefresh } from '../openkodo-profiles/cloud-auth/team-policy-refresh'

/** The daemon's relay host and its OpenKodo account, which signs the relay in and out. */
export async function installOpenkododRelayAndAccount(
  runtime: Parameters<typeof installOpenkododOpenKodoAccount>[0],
  registerCleanup: (cleanup: BackendServiceCleanup) => void
): Promise<OpenkododRelay> {
  const { createOpenkododRelay } = await import('./openkodod-relay')
  const relay = createOpenkododRelay(registerCleanup)
  installOpenkododOpenKodoAccount(runtime, relay, registerCleanup)
  return relay
}

/** The daemon's connector host, loaded on first use like its relay. */
export async function installOpenkododConnectorHost(
  ...args: Parameters<typeof OpenkododConnector.installOpenkododConnector>
): Promise<ReturnType<typeof OpenkododConnector.installOpenkododConnector>> {
  const { installOpenkododConnector } = await import('./openkodod-connector')
  return installOpenkododConnector(...args)
}

/** openkodod's OpenKodo account: signed in only through a client that relays the code, never a browser here. */
export function installOpenkododOpenKodoAccount(
  runtime: {
    bots: Pick<BotController, 'list'>
    serveOpenKodoProfile: (profileId: string) => void
    getConnectorCloud: () => Pick<
      ConnectorCloud,
      'accountChanged' | 'signOutStarted' | 'signOutFinished' | 'signedIn'
    > | null
  },
  relay: Pick<OpenkododRelay, 'accountChanged' | 'signOutStarted'>,
  registerCleanup: (cleanup: BackendServiceCleanup) => void,
  /** The profile openkodod serves, chosen at startup. */
  profileId = openkododServedProfileId()
): void {
  if (profileId) {
    runtime.serveOpenKodoProfile(profileId)
  }
  const account = new OpenKodoAccountService({
    openBrowser: async () => {
      throw new Error(
        'This server has no browser. Sign it in from a paired client or `openkodo auth login`.'
      )
    },
    accountBoundLinks: botAccountSwitchBlocker({
      bots: () => runtime.bots,
      profileId: () => profileId
    }),
    // A sign-out or switch on this server stops its relay and connector at once, as on the desktop.
    hooks: {
      onAuthMutation: () => {
        relay.accountChanged()
        runtime.getConnectorCloud()?.accountChanged()
      },
      onSignedIn: () => runtime.getConnectorCloud()?.signedIn(),
      onBeforeSignOut: () => {
        relay.signOutStarted()
        runtime.getConnectorCloud()?.signOutStarted()
      },
      onAfterSignOut: () => runtime.getConnectorCloud()?.signOutFinished()
    }
  })
  const server = new OpenKodoServerSignIn({ account })
  installOpenKodoServerSignIn(server)
  server.startDailyRefresh()
  registerCleanup(scheduleTeamPolicyRefresh(account))
  // A rotation saved only in memory would be replayed after restart and end the session family.
  getAppEnvironment().onWillQuit(flushUnsavedCloudSessions)
  registerCleanup(() => installOpenKodoServerSignIn(null))
  // No browser here: Google sign-in prints its link and takes the pasted address, or a paired desktop's.
  installGoogleConnect(new GoogleConnect())
  registerCleanup(() => installGoogleConnect(null))
}
