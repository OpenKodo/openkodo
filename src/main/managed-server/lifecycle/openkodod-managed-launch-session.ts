import type { OpenkododManagedRestartResult } from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-managed-runtime'
import {
  openkododLaunchSshSessionProbeCommand,
  parseOpenkododLaunchSshSession,
  recordsOpenkododLaunchSshSession,
  type OpenkododLaunchSshSession
} from '../install/openkodod-launch-ssh-session'
import { withManagedOpenkododLifecycle } from './openkodod-managed-lifecycle'
import {
  managedOpenkododInstallDir,
  managedOpenkododSlot,
  requireManagedOpenkododEnvironment,
  requireManagedOpenkododInfrastructure,
  resolveLinkedOpenkododContext
} from './openkodod-managed-runtime-context'
import { resolveOpenkododRemoteContext } from '../install/openkodod-remote-context'

import { rebuildOpenkododManagedTunnel } from './openkodod-managed-tunnel'
import { wakeStoppedManagedOpenkodod } from './openkodod-managed-wake'
import { openkododSlotDir } from '../activation/openkodod-recovery-slot'
import { execOpenkododRemote } from '../install/openkodod-remote-runtime-control'
import { collectManagedTerminalCensus } from './openkodod-terminal-census-client'
import { updateTerminalCounts } from '../activation/openkodod-fenced-stop'
import { stopIdleOpenkododForRestart } from './openkodod-idle-restart-stop'

export async function readManagedOpenkododLaunchSshSession(
  userDataPath: string,
  environmentId: string
): Promise<OpenkododLaunchSshSession> {
  const { deployment } = await requireManagedOpenkododEnvironment(userDataPath, environmentId)
  const { connectionManager, targetStore } = requireManagedOpenkododInfrastructure()
  const target = targetStore.getTarget(deployment.sshTargetId)
  // Background checks must not reconnect hosts the user left.
  const connection =
    target && connectionManager.getState(target.id)?.status === 'connected'
      ? (connectionManager.getConnection(target.id) ?? null)
      : null
  if (!target || !connection) {
    return 'unverifiable'
  }
  const context = await resolveOpenkododRemoteContext(target, connection)
  if (!recordsOpenkododLaunchSshSession(context.host)) {
    return 'not-applicable'
  }
  const active = context.activationRecord.active
  if (!active) {
    return 'not-recorded'
  }
  return parseOpenkododLaunchSshSession(
    await execOpenkododRemote(
      { conn: context.connection, host: context.host },
      openkododLaunchSshSessionProbeCommand(
        context.host,
        managedOpenkododInstallDir(context, active),
        context.userDataDir
      )
    )
  )
}

/** Restart only without terminals: surviving daemons retain the old SSH-session attribution. */
export async function restartManagedOpenkododEnvironment(
  userDataPath: string,
  selector: string
): Promise<OpenkododManagedRestartResult> {
  return await withManagedOpenkododLifecycle(
    userDataPath,
    selector,
    async ({ environment, deployment }) => {
      const context = await resolveLinkedOpenkododContext(environment, deployment)
      if (!context.activationRecord.active) {
        return { outcome: 'not-restarted', reason: 'This host has no activated OpenKodo server.' }
      }
      const counts = updateTerminalCounts((options) =>
        collectManagedTerminalCensus(
          userDataPath,
          environment,
          context.activationRecord,
          undefined,
          options
        )
      )
      // Reject live terminals before waiting for the host lock.
      const census = await counts.countFirst()
      if (census.liveSessions !== 0) {
        return { outcome: 'terminals-running', liveSessions: census.liveSessions }
      }
      const slot = managedOpenkododSlot(context, deployment.remotePort)
      const stopped = await stopIdleOpenkododForRestart(slot, counts)
      if (stopped.state === 'terminals-running') {
        return { outcome: 'terminals-running', liveSessions: stopped.liveSessions }
      }
      if (stopped.state === 'kept') {
        return { outcome: 'not-restarted', reason: stopped.reason }
      }
      // Wake even when daemon retirement failed: the stopped server cannot serve clients.
      const wake = await wakeStoppedManagedOpenkodod(slot)
      if (wake.outcome !== 'started' && wake.outcome !== 'serving') {
        return {
          outcome: 'not-restarted',
          reason:
            wake.outcome === 'recovery-refused'
              ? wake.reason
              : `This host’s OpenKodo server stopped but did not start again (${wake.outcome}); reconnect to start it.`
        }
      }
      // Restart may bind a different port than the existing forward.
      await rebuildOpenkododManagedTunnel(userDataPath, environment.id)
      const dir = openkododSlotDir(slot, stopped.version)
      if (stopped.state === 'daemon-kept') {
        // A retained daemon keeps old attribution, so preserve the warning.
        return { outcome: 'not-restarted', reason: stopped.reason }
      }
      const session = parseOpenkododLaunchSshSession(
        await execOpenkododRemote(
          slot,
          openkododLaunchSshSessionProbeCommand(slot.host, dir, slot.userDataDir)
        )
      )
      if (session === 'exited') {
        return {
          outcome: 'not-restarted',
          reason:
            'This host’s OpenKodo server restarted, but its terminals still belong to an SSH session ' +
            'that has ended: its terminal daemon was still running, or this connection opens a ' +
            'new SSH session for each command. Turn on SSH connection reuse for this host if ' +
            'it is off, then restart again.'
        }
      }
      return { outcome: 'restarted', environmentId: environment.id }
    }
  )
}
