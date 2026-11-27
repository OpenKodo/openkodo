// Only refusals sealed by the pinned key may trigger repair; foreign servers fail identity checks.
import type { KnownRuntimeEnvironment } from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import {
  pairingRevisionOf,
  type ManagedOpenkododPairingGate
} from './openkodod-managed-pairing-repair'
import {
  OpenkododManagedIdentityError,
  OpenkododManagedPairingRejectedError
} from './openkodod-managed-tunnel-identity'

export type ManagedOpenkododPairingRecovery = {
  resolve: (environmentId: string) => KnownRuntimeEnvironment | Promise<KnownRuntimeEnvironment>
  repairs: ManagedOpenkododPairingGate
  ensure: (environment: KnownRuntimeEnvironment) => Promise<void>
}

/** Check cached refusal before building; permit one repair and rebuild on a refused pairing. */
export async function buildWithPairingRepair(
  recovery: ManagedOpenkododPairingRecovery,
  environmentId: string,
  build: (environment: KnownRuntimeEnvironment) => Promise<void>
): Promise<'built' | 'repaired'> {
  const refused = await recovery.resolve(environmentId)
  const epoch = recovery.repairs.resetEpoch(environmentId)
  const standing = recovery.repairs.standingFailure(environmentId, pairingRevisionOf(refused))
  if (standing) {
    throw standing
  }
  try {
    await build(refused)
    return 'built'
  } catch (error) {
    if (error instanceof OpenkododManagedIdentityError && error.kind === 'replaced-server') {
      throw recovery.repairs.recordStandingRefusal(
        environmentId,
        pairingRevisionOf(refused),
        epoch,
        error
      )
    }
    if (!(error instanceof OpenkododManagedPairingRejectedError)) {
      throw error
    }
    console.warn(
      '[managed-openkodod] The OpenKodo server refused this desktop; pairing again:',
      error
    )
  }
  // Revision matching joins already-completed repairs instead of repeating host work.
  const repaired = await recovery.repairs.repair(environmentId, pairingRevisionOf(refused))
  try {
    await recovery.ensure(repaired)
  } catch (error) {
    throw error instanceof OpenkododManagedPairingRejectedError
      ? recovery.repairs.recordRefusedAfterRepair(environmentId, pairingRevisionOf(repaired), epoch)
      : error
  }
  return 'repaired'
}
