/** IPC for a host an older build changed after conversion: move its newer projects, or keep the server's. */
import { ipcMain } from 'electron'
import type {
  OpenkododDeltaMovePreview,
  OpenkododDeltaMoveResult
} from '../../../../shared/remote-runtime/openkodod-lifecycle/openkodod-managed-runtime'
import { listEnvironments } from '../../../../shared/remote-runtime/host-store/runtime-environment-store'
import { requireManagedOpenkododInfrastructure } from '../../../managed-server/lifecycle/openkodod-managed-runtime-context'
import { ensureOpenkododManagedTunnel } from '../../../managed-server/lifecycle/openkodod-managed-tunnel'
import {
  keepOpenkododServerVersion,
  runOpenkododDeltaMove
} from '../../../managed-server/migration/cutover/openkodod-migration-delta-move'
import { planOpenkododDeltaMove } from '../../../managed-server/migration/cutover/openkodod-migration-delta-plan'
import { censusHostRelayTerminalsFor } from '../../../ssh/legacy-relay/endpoints/ssh-host-relay-census-for-target'
import {
  openkododMigrationDestinationFor,
  openkododServerAutomationEnablerFor
} from '../../../managed-server/lifecycle/openkodod-runtime-conversion-wiring'
import { enableMovedOpenkododAutomationsForTarget } from '../../../persistence/migrating-openkodod-catalog/retained-source/openkodod-migration-moved-automations'
import { requiredString } from './openkodod-runtime-lifecycle-handlers'
import { publishResolvedChangedHostStatus } from './runtime-environment-managed-tunnel'
import { runTargetLifecycle } from '../../ssh/ssh-target-lifecycle-queue'

export function registerOpenkododDeltaMoveHandlers(getUserDataPath: () => string): void {
  ipcMain.handle(
    'runtimeEnvironments:previewOpenkododDeltaMove',
    (_event, args: { sshTargetId: string }): OpenkododDeltaMovePreview => {
      const { store, target } = requireChangedHost(args)
      const plan = planOpenkododDeltaMove(getUserDataPath(), store, target)
      const { sshTargetId, environmentId, added, notReflected, blockers } = plan
      return { sshTargetId, environmentId, added, notReflected, blockers }
    }
  )
  ipcMain.handle(
    'runtimeEnvironments:moveOpenkododDelta',
    async (_event, args: { sshTargetId: string }): Promise<OpenkododDeltaMoveResult> => {
      const userDataPath = getUserDataPath()
      const { store, claims, target } = requireChangedHost(args)
      const environment = (await listEnvironments(userDataPath)).find(
        (entry) => entry.id === target.openkododFence?.environmentId
      )
      if (!environment) {
        throw new Error('This host’s OpenKodo server is no longer registered.')
      }
      const result = await runOpenkododDeltaMove({
        userDataPath,
        store,
        claims,
        target,
        environment,
        connectDestination: async () =>
          openkododMigrationDestinationFor(
            await ensureOpenkododManagedTunnel(userDataPath, environment.id)
          ),
        censusHost: censusHostRelayTerminalsFor(target),
        runTargetLifecycle
      })
      if (result.outcome === 'moved') {
        // Tunnel repair may have re-paired the server; read its current credentials.
        const paired = (await listEnvironments(userDataPath)).find(
          (entry) => entry.id === environment.id
        )
        const automationsLeftDisabled = await enableMovedOpenkododAutomationsForTarget(
          userDataPath,
          target.id,
          openkododServerAutomationEnablerFor(paired ?? environment)
        ).catch((error: unknown) => {
          console.warn('[ssh] Could not re-enable moved automations:', error)
          return 0
        })
        publishResolvedChangedHostStatus(target, environment.id, automationsLeftDisabled)
      }
      return result
    }
  )
  ipcMain.handle(
    'runtimeEnvironments:keepOpenkododServerVersion',
    async (_event, args: { sshTargetId: string }): Promise<void> => {
      const { store, claims, target, environmentId } = requireChangedHost(args)
      await runTargetLifecycle(target.id, () =>
        keepOpenkododServerVersion({ userDataPath: getUserDataPath(), store, claims, target })
      )
      publishResolvedChangedHostStatus(target, environmentId)
    }
  )
}

function requireChangedHost(args: { sshTargetId: string } | undefined) {
  const sshTargetId = requiredString(args?.sshTargetId, 'SSH target')
  const { targetStore, claims } = requireManagedOpenkododInfrastructure()
  const store = targetStore.getOpenkododMigrationSource()
  const target = store.getSshTarget(sshTargetId)
  if (!target?.openkododFence?.sourceChangedAt) {
    throw new Error('This SSH host has no changes from an older OpenKodo to resolve.')
  }
  return { store, claims, target, environmentId: target.openkododFence.environmentId }
}
