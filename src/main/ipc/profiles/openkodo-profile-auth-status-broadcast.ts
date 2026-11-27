import { BrowserWindow } from 'electron'
import {
  OPENKODO_PROFILE_AUTH_STATUS_CHANGED_CHANNEL,
  OPENKODO_PROFILE_SIGN_IN_PROGRESS_CHANGED_CHANNEL,
  type OpenKodoCloudSignInProgress
} from '../../../shared/openkodo-profiles/openkodo-profiles'
import {
  getActiveTeamCapabilities,
  onTeamCapabilitiesInvalidated
} from '../../openkodo-profiles/cloud-auth/active-team-capabilities'

function broadcast(channel: string, ...args: unknown[]): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) {
      continue
    }
    try {
      window.webContents.send(channel, ...args)
    } catch {
      // A renderer can disappear between isDestroyed() and send().
    }
  }
}

export function broadcastOpenKodoProfileAuthStatusChanged(): void {
  broadcast(OPENKODO_PROFILE_AUTH_STATUS_CHANGED_CHANNEL)
}

export function broadcastTeamPolicyChanges(): void {
  const snapshot = (): string | undefined => {
    const team = getActiveTeamCapabilities()
    return team && JSON.stringify([team.teamPolicy, team.flags])
  }
  let previous = snapshot()
  onTeamCapabilitiesInvalidated(() => {
    const next = snapshot()
    if (next !== previous) {
      previous = next
      broadcastOpenKodoProfileAuthStatusChanged()
    }
  })
}

export function broadcastOpenKodoProfileSignInProgressChanged(
  progress: OpenKodoCloudSignInProgress | null
): void {
  broadcast(OPENKODO_PROFILE_SIGN_IN_PROGRESS_CHANGED_CHANNEL, progress)
}
