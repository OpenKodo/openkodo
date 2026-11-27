import { writeOpenkododActivationRecord } from '../activation/openkodod-activation-record-store'
import type { OpenkododActivationRecoveryResult } from '../activation/openkodod-activation-recovery'
import type { OpenkododDecommissionRecoveryPlan } from './openkodod-decommission-transaction'
import { settleOpenkododDecommissionStop } from './openkodod-decommission-stop'
import {
  openkododLivenessProbeCommand,
  openkododLivenessProvenExited,
  parseOpenkododLiveness
} from '../install/openkodod-remote-launch'
import { execOpenkododRemote } from '../install/openkodod-remote-runtime-control'
import {
  ensureOpenkododSlotServing,
  openkododSlotDir,
  resolveOpenkododSlotIdentity,
  type OpenkododSlotOptions
} from '../activation/openkodod-recovery-slot'

/** Only proven exit clears an interrupted decommission journal. */
export async function reconcileOpenkododDecommission(
  options: OpenkododSlotOptions,
  plan: OpenkododDecommissionRecoveryPlan
): Promise<OpenkododActivationRecoveryResult> {
  if (plan.action === 'keep-serving') {
    const identity = await resolveOpenkododSlotIdentity(options, plan.version)
    return {
      outcome: 'recovered',
      resolution: 'restored-incumbent',
      activeVersion: plan.version,
      readiness: await ensureOpenkododSlotServing(options, identity)
    }
  }
  if (plan.action === 'resume-stop') {
    const settlement = await settleOpenkododDecommissionStop(options, plan.request)
    if (settlement.state === 'unsettled') {
      return {
        outcome: 'refused',
        verdict: settlement.verdict,
        code: 'openkodod_recovery_decommission_unsettled',
        reason: settlement.reason
      }
    }
    if (settlement.state === 'withdrawn') {
      return reconcileOpenkododDecommission(options, {
        action: 'keep-serving',
        version: plan.request.version
      })
    }
    return reconcileOpenkododDecommission(options, {
      action: 'confirm-decommissioned',
      version: plan.request.version,
      record: plan.record
    })
  }
  // Live or unanswered slots retain the fence; only proven exit permits commit.
  const liveness = parseOpenkododLiveness(
    await execOpenkododRemote(
      options,
      openkododLivenessProbeCommand(options.host, openkododSlotDir(options, plan.version))
    )
  )
  if (!openkododLivenessProvenExited(liveness)) {
    return {
      outcome: 'refused',
      verdict: liveness === 'LIVE' ? 'live' : 'unverifiable',
      code: 'openkodod_recovery_decommissioned_slot_not_exited',
      reason: `openkodod ${plan.version} is recorded as stopped but is ${liveness.toLowerCase()}.`
    }
  }
  if (plan.record) {
    await writeOpenkododActivationRecord(options, plan.record)
  }
  return { outcome: 'recovered', resolution: 'committed', activeVersion: null, readiness: null }
}
