/**
 * #43632: before WSL hosts, users reached a distro through an SSH host, which starts openkodod without
 * the WSL host marker. A same-version connect reuses that server, which then refuses project
 * moves. Restart it as a WSL host only when a fenced recount proves no terminal and no native chat
 * runs on it; an SSH client still attached reconnects to the new server. Otherwise nothing stops,
 * and the host row offers "Restart as WSL host".
 */
import {
  OPENKODOD_NOT_WSL_HOST_LAUNCH_DEFERRAL_CODE,
  type WslHostDeferredUpdate
} from '../../../shared/remote-runtime/wsl-hosts/wsl-host-types'
import type { PairingOffer } from '../../../shared/remote-runtime/pairing/mobile-relay-pairing-offer'
import type { OpenkododSlotOptions } from '../../managed-server/activation/openkodod-recovery-slot'
import type { OpenkododRemoteContext } from '../../managed-server/install/openkodod-remote-context'
import { stopIdleOpenkododForRestart } from '../../managed-server/lifecycle/openkodod-idle-restart-stop'
import { wakeStoppedManagedOpenkodod } from '../../managed-server/lifecycle/openkodod-managed-wake'
import type { WslOpenkododHostTarget } from './wsl-openkodod-host-target'
import { readWslOpenkododIncumbent } from './wsl-openkodod-incumbent'
import type { WslOpenkododLaunchMode } from './wsl-openkodod-active-probe'
import type { ServeReadiness } from '../../server/serve-readiness'
import type { OpenkododTerminalCensus } from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-terminal-census'

/** What the connect serves after checking a server started without the WSL host marker. */
export type WslOpenkododHostRelaunch =
  | {
      ready: true
      /** Set when the server restarted and was probed again. */
      readiness: ServeReadiness | null
      /** Set when it still lacks the marker: the host row offers Restart as WSL host. */
      deferredUpdate: WslHostDeferredUpdate | null
    }
  /** A stop may have been sent or is held: the connect must not report this server ready. */
  | { ready: false; deferredUpdate: WslHostDeferredUpdate }

// Environments this run already restarted once: if the server comes back without the marker (an
// SSH client woke it first), later connects only offer the restart instead of bouncing it again.
const restartedThisSession = new Set<string>()

function wslHostNotWslLaunchedDeferral(fullVersion: string, reason: string): WslHostDeferredUpdate {
  return {
    candidateVersion: fullVersion,
    code: OPENKODOD_NOT_WSL_HOST_LAUNCH_DEFERRAL_CODE,
    reason,
    // Its own action, Restart as WSL host, ends the terminals; Force update would not help.
    forceable: false
  }
}

const WSL_HOST_RELAUNCH_LOST_REASON =
  'This host’s OpenKodo server was restarted as a WSL host, but it came back without the WSL host ' +
  'marker, likely because an SSH host started it again. Disconnect that SSH host, then restart it now.'

export async function relaunchAsWslHost(args: {
  environmentId: string
  context: OpenkododRemoteContext<WslOpenkododHostTarget>
  slot: OpenkododSlotOptions
  fullVersion: string
  paired: PairingOffer | null
  /** A project move to this distro runs here: a restart would cut it off, as an update would. */
  moveRunning: boolean
  readIncumbent?: typeof readWslOpenkododIncumbent
  /** Reads the restarted server again: its readiness, and whether it carries the marker now. */
  reprobe: () => Promise<{ readiness: ServeReadiness; launch: WslOpenkododLaunchMode }>
}): Promise<WslOpenkododHostRelaunch> {
  const deferred = (reason: string): Extract<WslOpenkododHostRelaunch, { ready: true }> => ({
    ready: true,
    readiness: null,
    deferredUpdate: wslHostNotWslLaunchedDeferral(args.fullVersion, reason)
  })
  if (restartedThisSession.has(args.environmentId)) {
    return deferred(WSL_HOST_RELAUNCH_LOST_REASON)
  }
  if (args.moveRunning) {
    return deferred(
      'A project is moving to this host; its server restarts as a WSL host once the move finishes.'
    )
  }
  const incumbent = await (args.readIncumbent ?? readWslOpenkododIncumbent)({
    context: args.context,
    slot: args.slot,
    paired: args.paired
  })
  const { census } = incumbent
  // An unanswered count is unknown, never zero; in-process terminals end with openkodod itself.
  if (census.liveSessions !== 0 || (census.inProcessSessions ?? 0) !== 0) {
    return deferred(terminalsRunning(census.liveSessions))
  }
  const chats = chatsRunning(census)
  if (chats !== null) {
    return deferred(chats)
  }
  const stopped = await stopIdleOpenkododForRestart(args.slot, {
    recountCensus: incumbent.recount,
    releaseIncumbentAdmission: incumbent.releaseAdmission,
    refuseOtherWork: chatsRunning
  })
  if (stopped.state === 'terminals-running') {
    return deferred(terminalsRunning(stopped.liveSessions))
  }
  if (stopped.state === 'kept') {
    // A stop that may be underway is never reported ready. Any other kept stop (a lock another
    // client holds, a stale count, a withdrawn or refused stop) left the server serving.
    return stopped.mayBeStopping
      ? {
          ready: false,
          deferredUpdate: wslHostNotWslLaunchedDeferral(args.fullVersion, stopped.reason)
        }
      : deferred(stopped.reason)
  }
  restartedThisSession.add(args.environmentId)
  // The WSL transport starts it detached, with the marker.
  const wake = await wakeStoppedManagedOpenkodod(args.slot)
  // Fenced: another client (an SSH host) is starting it now; the probe that follows decides.
  if (wake.outcome !== 'started' && wake.outcome !== 'serving' && wake.outcome !== 'fenced') {
    throw new Error(
      wake.outcome === 'recovery-refused'
        ? wake.reason
        : `This host’s OpenKodo server stopped to restart as a WSL host but did not start again (${wake.outcome}); connect to start it.`
    )
  }
  const { readiness, launch } = await args.reprobe()
  // An SSH client woke it first: offer the restart rather than bouncing it again.
  return launch === 'other'
    ? { ...deferred(WSL_HOST_RELAUNCH_LOST_REASON), readiness }
    : {
        ready: true,
        readiness,
        deferredUpdate: null
      }
}

function terminalsRunning(liveSessions: number | null): string {
  const what =
    liveSessions === null
      ? 'OpenKodo could not count its terminals'
      : `${liveSessions} terminal${liveSessions === 1 ? ' runs' : 's run'} on it`
  return (
    `This host’s OpenKodo server was not started as a WSL host (an SSH host usually started it), and ${what}. ` +
    'It restarts as a WSL host when OpenKodo next connects with no terminals running, or restart it now.'
  )
}

/** A chat's provider runs inside openkodod, so the stop would end its turn; an unreported count is unknown. */
function chatsRunning(census: OpenkododTerminalCensus): string | null {
  const chats = census.chatSessions
  if (chats === 0) {
    return null
  }
  const what =
    typeof chats !== 'number'
      ? 'OpenKodo could not tell whether a chat runs on it'
      : `${chats} chat${chats === 1 ? ' runs' : 's run'} on it`
  return (
    `This host’s OpenKodo server was not started as a WSL host (an SSH host usually started it), and ${what}. ` +
    'It restarts as a WSL host when OpenKodo next connects with no terminals or chats running, or restart it now.'
  )
}
