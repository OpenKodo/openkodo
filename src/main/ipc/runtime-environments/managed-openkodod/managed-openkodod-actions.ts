import {
  cancelManagedOpenkododStop,
  forgetManagedOpenkododEnvironment,
  forgetRedundantManagedOpenkododEnvironment,
  stopManagedOpenkododEnvironment
} from '../../../managed-server/lifecycle/openkodod-runtime-decommission'
import { getManagedOpenkododRuntimeStatus } from '../../../managed-server/lifecycle/openkodod-runtime-status'
import { recoverManagedOpenkododEnvironment } from '../../../managed-server/lifecycle/openkodod-managed-recovery'
import { rollbackManagedOpenkododEnvironment } from '../../../managed-server/lifecycle/openkodod-managed-rollback'
import { updateManagedOpenkododEnvironment } from '../../../managed-server/lifecycle/openkodod-runtime-maintenance'
import { getOpenkododSshDeployment } from '../../../../shared/remote-runtime/host-catalog/runtime-environments'
import { resolveEnvironment } from '../../../../shared/remote-runtime/host-store/runtime-environment-store'
import type {
  OpenkododManagedRestartResult,
  OpenkododManagedStaleLockReclaimRequest,
  OpenkododManagedStaleLockReclaimResult
} from '../../../../shared/remote-runtime/openkodod-lifecycle/openkodod-managed-runtime'
import { restartManagedOpenkododEnvironment } from '../../../managed-server/lifecycle/openkodod-managed-launch-session'
import { forgetManagedOpenkododAutomaticFailures } from '../../../managed-server/lifecycle/openkodod-managed-tunnel'
import { runManagedOpenkododStaleLockReclaim } from '../../../managed-server/lifecycle/openkodod-managed-stale-lock-reclaim'
import { clearLaunchSessionNote } from './runtime-environment-managed-tunnel'
import { forgetLaunchSessionVerdict } from '../../ssh/ssh-host-launch-session-note'
import {
  liftUserHoldsForServerAction,
  resumeRuntimeEnvironmentStatus
} from '../../ssh/ssh-host-user-disconnect'
import { releaseUnlinkedHostTransport } from '../../ssh/ssh-session-teardown'
import type { ManagedServerActions } from '../../../runtime/hosts/management/managed-server-actions-registry'
import {
  retireRemovedRuntimeEnvironment,
  type RemovedServerStore
} from '../catalog/runtime-environment-removal-cleanup'

export type ManagedOpenkododActionOptions = {
  getUserDataPath: () => string
  getActiveEnvironmentId: () => string | null | undefined
  invalidateTransport: (environmentId: string) => Promise<void> | void
  clearHostServerNotes: (sshTargetId: string, environmentId: string) => void
  clearHostServerStatus: (sshTargetId: string) => void
  store: RemovedServerStore
}

export function createManagedOpenkododActions(
  options: ManagedOpenkododActionOptions
): ManagedServerActions {
  const userDataPath = options.getUserDataPath
  const unlinkPolicy = {
    isActiveEnvironment: (environmentId: string) =>
      options.getActiveEnvironmentId() === environmentId,
    retireLocalState: (environmentId: string) =>
      retireRemovedRuntimeEnvironment(
        environmentId,
        options.invalidateTransport,
        options.store,
        userDataPath()
      ),
    releaseHostTransport: releaseUnlinkedHostTransport
  }
  return {
    status: (selector) => getManagedOpenkododRuntimeStatus(userDataPath(), selector),
    update: (selector, force, pastLiveTerminals, endInProcessTerminals) =>
      asExplicitServerAction(userDataPath(), selector, async () => {
        const result = await updateManagedOpenkododEnvironment(userDataPath(), {
          selector,
          force,
          ...(pastLiveTerminals ? { pastLiveTerminals } : {}),
          ...(endInProcessTerminals === true ? { endInProcessTerminals } : {})
        })
        if (result.outcome === 'updated') {
          await options.invalidateTransport(result.environment.id)
        }
        if (result.outcome !== 'deferred') {
          const targetId = getOpenkododSshDeployment(result.environment)?.sshTargetId
          if (targetId) {
            options.clearHostServerNotes(targetId, result.environment.id)
          }
        }
        return result
      }),
    rollback: (selector) =>
      asExplicitServerAction(userDataPath(), selector, async () => {
        const result = await rollbackManagedOpenkododEnvironment(userDataPath(), { selector })
        if (result.outcome === 'rolled-back') {
          await options.invalidateTransport(result.environment.id)
        }
        return result
      }),
    recover: (selector, acceptChangedState) =>
      asExplicitServerAction(userDataPath(), selector, async () => {
        const result = await recoverManagedOpenkododEnvironment(userDataPath(), {
          selector,
          acceptChangedState: acceptChangedState === true
        })
        if (result.outcome === 'recovered' && result.activeVersion) {
          await options.invalidateTransport(result.environment.id)
        }
        return result
      }),
    stop: async (selector) => {
      const result = await stopManagedOpenkododEnvironment(
        userDataPath(),
        { selector },
        unlinkPolicy
      )
      if (result.outcome === 'unlinked') {
        options.clearHostServerStatus(result.sshTargetId)
      }
      return result
    },
    cancelStop: async (selector) => await cancelManagedOpenkododStop(userDataPath(), { selector }),
    forget: async (selector) => {
      const result = await forgetManagedOpenkododEnvironment(
        userDataPath(),
        { selector },
        unlinkPolicy
      )
      if (result.outcome === 'forgotten') {
        options.clearHostServerStatus(result.sshTargetId)
      }
      return result
    },
    forgetRedundant: async (selector) => {
      const result = await forgetRedundantManagedOpenkododEnvironment(
        userDataPath(),
        { selector },
        unlinkPolicy
      )
      if (result.outcome === 'forgotten') {
        options.clearHostServerStatus(result.sshTargetId)
      }
      return result
    }
  }
}

export async function restartManagedOpenkodod(
  options: ManagedOpenkododActionOptions,
  selector: string
): Promise<OpenkododManagedRestartResult> {
  return asExplicitServerAction(options.getUserDataPath(), selector, async () => {
    const result = await restartManagedOpenkododEnvironment(options.getUserDataPath(), selector)
    if (result.outcome === 'restarted') {
      await reconnectRestartedManagedOpenkodod(options, result.environmentId)
    }
    return result
  })
}

export async function reclaimManagedOpenkododStaleLock(
  options: ManagedOpenkododActionOptions,
  selector: string,
  request: OpenkododManagedStaleLockReclaimRequest
): Promise<OpenkododManagedStaleLockReclaimResult> {
  const result = await runManagedOpenkododStaleLockReclaim(
    options.getUserDataPath(),
    selector,
    request
  )
  // Reconnect also replaces stale-lock feedback when no process had started.
  if (result.status === 'reclaimed') {
    await reconnectRestartedManagedOpenkodod(options, result.environmentId)
  }
  return result
}

async function reconnectRestartedManagedOpenkodod(
  options: ManagedOpenkododActionOptions,
  environmentId: string
): Promise<void> {
  await options.invalidateTransport(environmentId)
  const environment = await resolveEnvironment(options.getUserDataPath(), environmentId)
  const targetId = getOpenkododSshDeployment(environment)?.sshTargetId
  if (targetId) {
    options.clearHostServerNotes(targetId, environmentId)
    forgetLaunchSessionVerdict(targetId)
    clearLaunchSessionNote(targetId, environmentId)
  }
}

/** A user's Update, Rollback, Recover or Restart is a Connect: it re-arms automatic starts and lifts a Disconnect. */
async function asExplicitServerAction<T>(
  userDataPath: string,
  selector: string,
  action: () => Promise<T>
): Promise<T> {
  let lifted: string[] = []
  try {
    const environment = await resolveEnvironment(userDataPath, selector)
    forgetManagedOpenkododAutomaticFailures(userDataPath, environment.id)
    lifted = await liftUserHoldsForServerAction(environment)
  } catch {
    // An unknown selector fails in the action itself with its own error.
  }
  try {
    // `action` includes its transport invalidation, so resumed status never probes the old transport.
    return await action()
  } finally {
    await resumeLiftedStatus(lifted)
  }
}

async function resumeLiftedStatus(environmentIds: readonly string[]): Promise<void> {
  try {
    await resumeRuntimeEnvironmentStatus(environmentIds)
  } catch (error) {
    // A server removed during the action has no status to resume; keep the action's own result.
    console.warn('[managed-openkodod] Could not resume status after an explicit action:', error)
  }
}
