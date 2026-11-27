/**
 * A same-version WSL connect takes one activation fence instead of two: the deploy confirms the
 * slot is installed and skips its own fence, then the wake's fence re-reads the record and starts
 * the slot if it stopped. A fence the snapshot saw held, another version active by then, or a busy
 * fence all run the full deploy and wake, as before.
 */
import type { OpenkododActivationRecord } from '../../managed-server/activation/openkodod-activation-record'
import { wakeExpectedOpenkododUnderOneFence } from '../../managed-server/lifecycle/openkodod-managed-wake'
import type {
  OpenkododDeployOptions,
  OpenkododDeployResult
} from '../../managed-server/install/openkodod-remote-deploy'
import type { OpenkododSlotOptions } from '../../managed-server/activation/openkodod-recovery-slot'

type DeployExtra = Pick<OpenkododDeployOptions, 'preRead' | 'sameVersionFencedByCaller'>

export async function deployWslOpenkododWithOneFence(
  slot: OpenkododSlotOptions,
  deploy: (extra: DeployExtra) => Promise<OpenkododDeployResult>,
  hinted: { preRead?: { record: OpenkododActivationRecord; fenceOpen: boolean } }
): Promise<{ deployed: OpenkododDeployResult; woken: boolean }> {
  if (!hinted.preRead?.fenceOpen) {
    return { deployed: await deploy(hinted), woken: false }
  }
  const first = await deploy({ ...hinted, sameVersionFencedByCaller: true })
  if (first.outcome !== 'already-active') {
    return { deployed: first, woken: false }
  }
  const wake = await wakeExpectedOpenkododUnderOneFence(slot, first.fullVersion)
  if (wake.outcome === 'replan' || wake.outcome === 'fenced') {
    // The host moved since the snapshot, so this deploy takes no hints.
    return { deployed: await deploy({}), woken: false }
  }
  if (wake.outcome === 'recovery-refused') {
    throw new Error(wake.reason)
  }
  return { deployed: first, woken: true }
}
