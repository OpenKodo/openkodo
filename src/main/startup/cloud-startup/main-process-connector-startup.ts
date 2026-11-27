import { powerMonitor } from 'electron'
import type { ConnectorCloud } from '../../connector-cloud/connector-cloud'
import { installConnectorHost } from '../../connector-cloud/connector-host-install'
import { registerSlackHandOffHandlers } from '../../ipc/slack-hand-off'
import { registerAvatarGenerationHandlers } from '../../avatar-generation/avatar-generation-ipc'
// removed browser manager import:  '../../browser/guest-lifecycle/manager/browser-manager'
import { getProfileUserDataPath } from '../../openkodo-profiles/profile-storage-paths'
import { mainProcessState as state } from '../main-process-state'

/**
 * The desktop's or Electron `openkodo serve`'s connector, as this process's own OpenKodo account.
 * Created before the window exists, so its sign-in and sign-out hooks always find it.
 */
export function installMainProcessConnectorCloud(serve: boolean): void {
  if (!state.core.runtime || !state.store) {
    return
  }
  const runtime = state.core.runtime
  const userDataPath = getProfileUserDataPath()
  const host = installConnectorHost({
    runtime,
    store: state.store,
    userDataPath,
    kind: serve ? 'serve' : 'desktop',
    isFenced: () => state.isQuitting
  })
  if (serve) {
    return
  }
  powerMonitor.on('resume', host.refreshLinearLogins)
  registerSlackHandOffHandlers(() => runtime.getConnectorCloud())
  registerAvatarGenerationHandlers(() => runtime.getCommitMessageAgentEnvironmentResolvers())
}

/** This process's connector, for the startup, auth and quit hooks. */
export function mainProcessConnectorCloud(): ConnectorCloud | null {
  return state.core.runtime?.getConnectorCloud() ?? null
}

/** Quit and relaunch: the relay host and the connector stop taking cloud work before teardown. */
export function fenceMainProcessCloudOnQuit(): void {
  state.core.relayHost?.fence()
  mainProcessConnectorCloud()?.fence()
}

// Registered with the relay; like it, the first request waits for the persisted proxy.
export function connectMainProcessConnectorCloud(): void {
  void state.initialProxyApplicationReady.then(() => mainProcessConnectorCloud()?.connect())
}
