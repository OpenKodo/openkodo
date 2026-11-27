import { getAppEnvironment } from '../../../shared/app-lifecycle/app-environment'
import type { ManagedServerUpdateDeps } from './managed-server-update-check'
import { autoUpdateManagedOpenkododEnvironment } from '../../managed-server/lifecycle/openkodod-managed-auto-update'
import { requireManagedOpenkododTargetStore } from '../../managed-server/lifecycle/openkodod-managed-runtime-context'
import {
  openkododUpdateFailedThisLaunch,
  recordOpenkododUpdateFailedThisLaunch
} from '../../managed-server/lifecycle/openkodod-managed-update-failure-memory'

export function managedServerUpdateDeps(userDataPath: string): ManagedServerUpdateDeps {
  const registry = requireManagedOpenkododTargetStore()
  const appVersion = getAppEnvironment().getVersion()
  return {
    autoUpdate: async (environmentId, options) =>
      await autoUpdateManagedOpenkododEnvironment(userDataPath, {
        environmentId,
        appVersion,
        ...options
      }),
    // Re-read the store: caller snapshots may predate an overlapping check's failure.
    recordedUpdateFailure: (target) => {
      const failure = (registry.getTarget(target.id) ?? target).managedServerUpdateFailure
      return failure?.appVersion === appVersion ? failure.reason : null
    },
    // Only attempted failures suppress retry; keep launch-only state out of peer-published SshTarget.
    failedThisLaunch: (target) => openkododUpdateFailedThisLaunch({ kind: 'ssh', id: target.id }),
    recordUpdateFailure: (target, reason) => {
      recordOpenkododUpdateFailedThisLaunch(
        { kind: 'ssh', id: target.id },
        { code: 'openkodod_update_failed', reason }
      )
      registry.updateTarget(target.id, { managedServerUpdateFailure: { reason, appVersion } })
    },
    clearUpdateFailure: (target) => {
      registry.updateTarget(target.id, { managedServerUpdateFailure: undefined })
    }
  }
}
