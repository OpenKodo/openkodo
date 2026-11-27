/** Release conversion setups stranded before staging by refused SSH forwarding. Stop any activated slot, unregister, then use undeployed-fence release; source rows remain intact for retry. */
import { listEnvironments } from '../../../../shared/remote-runtime/host-store/runtime-environment-store'
import { removeManagedOpenkododEnvironment } from '../../../../shared/remote-runtime/host-store/runtime-environment-managed-openkodod-store'
import { findOpenkododMigrationSourceCutoverForTarget } from '../../../persistence/migrating-openkodod-catalog/cutover-journals/openkodod-migration-cutover-journal'
import { releaseUndeployedMigrationFence } from '../../../ssh/migration-source/openkodod-migration-source-fence'
import { closeOpenkododManagedTunnel } from '../../lifecycle/openkodod-managed-tunnel'
import type { SshTargetOpenkododClaims } from '../../../ssh/targets/ssh-target-openkodod-claims'
import { withOpenkododActivationLock } from '../../activation/openkodod-activation-lock'
import { withDeactivatedVersionCommitted } from '../../activation/openkodod-activation-record'
import {
  readOpenkododActivationRecord,
  writeOpenkododActivationRecord
} from '../../activation/openkodod-activation-record-store'
import { managedOpenkododSlot } from '../../lifecycle/openkodod-managed-runtime-context'
import { resolveOpenkododRemoteContext } from '../../install/openkodod-remote-context'
import { openkododStopFreedTheHost } from '../../install/openkodod-remote-process-control'
import { openkododSlotDir, stopOpenkododSlot } from '../../activation/openkodod-recovery-slot'

import {
  getSshConnectionManager,
  getSshTargetRegistryStore
} from '../../../ssh/targets/ssh-target-registry'
import { errorMessage } from '../../../../shared/errors/error-message'

export async function releaseUnreachableOpenkododSetup(args: {
  userDataPath: string
  claims: SshTargetOpenkododClaims
  targetId: string
  signal?: AbortSignal
}): Promise<void> {
  const cutover = findOpenkododMigrationSourceCutoverForTarget(args.userDataPath, args.targetId)
  // Staged/committed destinations require their own evidence before release.
  if (cutover?.phase !== 'source-fenced') {
    return
  }
  const environmentId = cutover.destinationEnvironmentId
  await closeOpenkododManagedTunnel(environmentId).catch(() => undefined)
  await stopStrandedOpenkodod(args.targetId, args.signal).catch((error: unknown) => {
    console.warn(
      `[openkodod] Could not stop the unreachable setup's server: ${errorMessage(error)}`
    )
  })
  const isRegistered = async (id: string): Promise<boolean> =>
    (await listEnvironments(args.userDataPath)).some((entry) => entry.id === id)
  // Unregister first so an interrupted release leaves a recoverable undeployed fence.
  if (await isRegistered(environmentId)) {
    await removeManagedOpenkododEnvironment(args.userDataPath, environmentId)
  }
  await releaseUndeployedMigrationFence({
    userDataPath: args.userDataPath,
    claims: args.claims,
    targetId: args.targetId,
    isDestinationRegistered: isRegistered,
    signal: args.signal
  })
}

/** Clear active only after proven slot exit; daemon terminals may outlive it. */
async function stopStrandedOpenkodod(targetId: string, signal?: AbortSignal): Promise<void> {
  const target = getSshTargetRegistryStore()?.getTarget(targetId)
  const connectionManager = getSshConnectionManager()
  if (!target || !connectionManager) {
    return
  }
  const context = await resolveOpenkododRemoteContext(
    target,
    await connectionManager.connect(target),
    signal
  )
  if (!context.activationRecord.active) {
    return
  }
  // Port is irrelevant because this recovery never launches a slot.
  const slot = managedOpenkododSlot(context, 0, signal)
  await withOpenkododActivationLock(
    slot,
    async () => {
      const record = await readOpenkododActivationRecord(slot)
      if (!record.active) {
        return
      }
      const stopped = await stopOpenkododSlot(slot, openkododSlotDir(slot, record.active), false)
      if (openkododStopFreedTheHost(stopped)) {
        await writeOpenkododActivationRecord(slot, withDeactivatedVersionCommitted(record))
      }
    },
    () => undefined
  )
}
