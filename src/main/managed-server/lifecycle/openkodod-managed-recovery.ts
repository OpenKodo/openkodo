import { redactRuntimeEnvironment } from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import type { OpenkododManagedRecoveryResult } from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-managed-runtime'
import { recoverInterruptedOpenkododActivation } from '../activation/openkodod-activation-recovery'
import {
  managedOpenkododSlot,
  resolveLinkedOpenkododContext
} from './openkodod-managed-runtime-context'

import { refreshMaintainedOpenkododPairing } from './openkodod-maintenance-pairing-refresh'
import type { LifecycleArgs } from './openkodod-managed-lifecycle'
import {
  withManagedOpenkododLifecycle,
  followLaunchedServerPort
} from './openkodod-managed-lifecycle'

export async function recoverManagedOpenkododEnvironment(
  userDataPath: string,
  args: LifecycleArgs & { acceptChangedState?: boolean }
): Promise<OpenkododManagedRecoveryResult> {
  return await withManagedOpenkododLifecycle(
    userDataPath,
    args.selector,
    async ({ environment, deployment }) => {
      const context = await resolveLinkedOpenkododContext(environment, deployment, args.signal)
      const result = await recoverInterruptedOpenkododActivation({
        ...managedOpenkododSlot(context, deployment.remotePort, args.signal),
        acceptChangedState: args.acceptChangedState === true
      })
      if (result.outcome !== 'recovered') {
        return result
      }
      const updated = result.readiness
        ? await refreshMaintainedOpenkododPairing(userDataPath, environment.id, result.readiness)
        : environment
      if (result.activeVersion) {
        await followLaunchedServerPort(userDataPath, environment.id)
      }
      return {
        outcome: 'recovered',
        resolution: result.resolution,
        activeVersion: result.activeVersion,
        environment: redactRuntimeEnvironment(updated)
      }
    }
  )
}
