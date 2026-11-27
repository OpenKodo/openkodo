/** Registered destinations must abort/prove empty, then unregister before fence release so later starts cannot reclaim the host. Never-registered destinations held nothing. */
import { removeManagedOpenkododEnvironment } from '../../../../shared/remote-runtime/host-store/runtime-environment-managed-openkodod-store'
import { listEnvironments } from '../../../../shared/remote-runtime/host-store/runtime-environment-store'
import type { KnownRuntimeEnvironment } from '../../../../shared/remote-runtime/host-catalog/runtime-environments'
import { closeOpenkododManagedTunnel } from '../../lifecycle/openkodod-managed-tunnel'
import {
  abortOpenkododMigrationCutover,
  type OpenkododMigrationAbortResult,
  type OpenkododMigrationCutoverContext,
  type OpenkododMigrationDestinationCatalog
} from './openkodod-migration-cutover-coordinator'
import { findOpenkododMigrationSourceCutoverForTarget } from '../../../persistence/migrating-openkodod-catalog/cutover-journals/openkodod-migration-cutover-journal'
import {
  releaseOpenkododMigrationFence,
  releaseUndeployedMigrationFence
} from '../../../ssh/migration-source/openkodod-migration-source-fence'

export async function abandonOpenkododConversion(args: {
  userDataPath: string
  store: OpenkododMigrationCutoverContext['store']
  claims: OpenkododMigrationCutoverContext['claims']
  targetId: string
  destinationFor: (environment: KnownRuntimeEnvironment) => OpenkododMigrationDestinationCatalog
}): Promise<OpenkododMigrationAbortResult | 'none'> {
  const cutover = findOpenkododMigrationSourceCutoverForTarget(args.userDataPath, args.targetId)
  // Committed delta chains resolve only through the delta flow.
  if (!cutover || cutover.supersedesMigrationId) {
    return 'none'
  }
  const isRegistered = async (id: string): Promise<boolean> =>
    (await listEnvironments(args.userDataPath)).some((entry) => entry.id === id)
  const environment = (await listEnvironments(args.userDataPath)).find(
    (entry) => entry.id === cutover.destinationEnvironmentId
  )
  if (!environment) {
    await releaseUndeployedMigrationFence({ ...args, isDestinationRegistered: isRegistered })
    return 'none'
  }
  const context = { ...args, destination: args.destinationFor(environment) }
  return abortOpenkododMigrationCutover(context, cutover.migrationId, async (aborted) => {
    await closeOpenkododManagedTunnel(environment.id).catch(() => undefined)
    await removeManagedOpenkododEnvironment(args.userDataPath, environment.id)
    await releaseOpenkododMigrationFence(context, aborted)
  })
}
