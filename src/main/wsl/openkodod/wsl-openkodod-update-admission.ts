/** Reuse SSH update admission: keep newer, rolled-back or launch-rejected incumbents serving; fenced activation replans before committing. */
import {
  OPENKODOD_HOST_NEWER_DEFERRAL_CODE,
  OPENKODOD_UPDATE_WSL_MOVE_RUNNING_CODE,
  type WslHostDeferredUpdate
} from '../../../shared/remote-runtime/wsl-hosts/wsl-host-types'
import { refuseOpenkododHostDowngrade } from '../../managed-server/activation/openkodod-host-version-admission'
import type { ServeReadiness } from '../../server/serve-readiness'
import type { OpenkododActivationRecord } from '../../managed-server/activation/openkodod-activation-record'
import { readOpenkododActivationRecord } from '../../managed-server/activation/openkodod-activation-record-store'
import { readOpenkododActivationTransaction } from '../../managed-server/activation/openkodod-activation-transaction-store'
import { isWaitingOpenkododUpdateDeferral } from '../../managed-server/lifecycle/openkodod-managed-auto-update'
import {
  openkododUpdateSkipRefusal,
  planOpenkododUpdateForIntent,
  type ManagedOpenkododAutoUpdatePlan,
  type OpenkododUpdateIntent
} from '../../managed-server/lifecycle/openkodod-managed-update-decision'
import {
  openkododUpdateFailureThisLaunch,
  recordOpenkododUpdateFailedThisLaunch,
  type OpenkododUpdateFailure,
  type OpenkododUpdateFailureHost
} from '../../managed-server/lifecycle/openkodod-managed-update-failure-memory'
import { OPENKODOD_ACTIVATION_POLICY_REFUSED_CODE } from '../../managed-server/activation/openkodod-installed-activation'
import type { OpenkododSlotOptions } from '../../managed-server/activation/openkodod-recovery-slot'
import { adoptRunningOpenkododVersion } from '../../managed-server/activation/openkodod-running-version-adoption'
import type { WslOpenkododLaunch } from './wsl-openkodod-launch-contract'

type WslOpenkododReadyLaunch = Extract<WslOpenkododLaunch, { outcome: 'ready' }>

export type WslOpenkododUpdateAdmission =
  | {
      action: 'serve'
      version: string
      readiness: ServeReadiness
      deferredUpdate: WslHostDeferredUpdate | null
    }
  /** Another run holds the host fence; a later connect adopts or deploys. */
  | { action: 'defer'; deferredUpdate: WslHostDeferredUpdate }
  /** Deploy this app's build on this record. */
  | { action: 'deploy'; record: OpenkododActivationRecord }

export async function admitWslOpenkododUpdate(args: {
  slot: OpenkododSlotOptions
  record: OpenkododActivationRecord
  candidateVersion: string
  appVersion: string
  host: OpenkododUpdateFailureHost
  intent: OpenkododUpdateIntent
  /** A project move to this distro runs here: a redeploy would cut it off, even when forced. */
  moveRunning?: boolean
}): Promise<WslOpenkododUpdateAdmission> {
  const { record, candidateVersion, appVersion } = args
  if (!record.active) {
    return { action: 'deploy', record }
  }
  const failure = openkododUpdateFailureThisLaunch(args.host)
  const plan = planOpenkododUpdateForIntent(args.intent, {
    record,
    candidateVersion,
    appVersion,
    failedBefore: failure !== null
  })
  const heldForMove = args.moveRunning === true && plan.action === 'update'
  if (!heldForMove && (plan.action !== 'skip' || plan.reason === 'current')) {
    return { action: 'deploy', record }
  }
  const adopted = await adoptRunningOpenkododVersion(args.slot, record, candidateVersion)
  if (!adopted) {
    // Nothing active any more: deploy on the record the wake read; its fenced admission re-plans.
    return { action: 'deploy', record: await readOpenkododActivationRecord(args.slot) }
  }
  if ('outcome' in adopted) {
    const { candidateVersion: version, code, reason, forceable } = adopted
    return {
      action: 'defer',
      deferredUpdate: { candidateVersion: version, code, reason, forceable: forceable === true }
    }
  }
  return {
    action: 'serve',
    version: adopted.version,
    readiness: adopted.readiness,
    deferredUpdate:
      adopted.version === candidateVersion
        ? null
        : heldForMove
          ? {
              candidateVersion,
              code: OPENKODOD_UPDATE_WSL_MOVE_RUNNING_CODE,
              reason:
                'A project is moving to this WSL host; its server updates once the move finishes.',
              forceable: false
            }
          : skippedUpdateHint(plan, failure, record, candidateVersion, appVersion)
  }
}

/** The launch an admission ends in, or the record to deploy on. */
export async function admitWslOpenkododLaunch(
  args: Parameters<typeof admitWslOpenkododUpdate>[0],
  distro: string,
  readyLaunch: (serving: {
    fullVersion: string
    readiness: ServeReadiness
  }) => Promise<WslOpenkododReadyLaunch>
): Promise<WslOpenkododLaunch | OpenkododActivationRecord> {
  const admission = await admitWslOpenkododUpdate(args)
  if (admission.action === 'deploy') {
    return admission.record
  }
  if (admission.action === 'defer') {
    return { outcome: 'deferred', distro, ...admission.deferredUpdate }
  }
  const ready = await readyLaunch({
    fullVersion: admission.version,
    readiness: admission.readiness
  })
  return admission.deferredUpdate ? { ...ready, deferredUpdate: admission.deferredUpdate } : ready
}

/** Offer Update/Force for retriable host deferrals; newer hosts get no hint because Update cannot change that refusal. */
function skippedUpdateHint(
  plan: ManagedOpenkododAutoUpdatePlan,
  failure: OpenkododUpdateFailure | null,
  record: OpenkododActivationRecord,
  candidateVersion: string,
  appVersion: string
): WslHostDeferredUpdate | null {
  if (plan.action !== 'skip') {
    return null
  }
  if (plan.reason === 'failed-before' && failure) {
    return { candidateVersion, ...failure, forceable: true }
  }
  const refusal =
    plan.reason === 'rolled-back'
      ? openkododUpdateSkipRefusal(plan, record, candidateVersion, appVersion)
      : null
  return refusal
    ? {
        candidateVersion,
        code: OPENKODOD_ACTIVATION_POLICY_REFUSED_CODE,
        reason: refusal,
        forceable: true
      }
    : null
}

/** Do not retry rejected/thrown incumbent updates this launch, matching SSH. Waits/policy refusals never attempted activation and record no failure. */
export function recordWslOpenkododUpdateFailure(
  host: OpenkododUpdateFailureHost,
  incumbentVersion: string | null,
  failure: OpenkododUpdateFailure | null
): void {
  if (incumbentVersion && failure) {
    recordOpenkododUpdateFailedThisLaunch(host, failure)
  }
}

export function wslOpenkododDeferralFailure(deployed: {
  code: string
  reason: string
}): OpenkododUpdateFailure | null {
  return isWaitingOpenkododUpdateDeferral(deployed.code) ||
    deployed.code === OPENKODOD_ACTIVATION_POLICY_REFUSED_CODE
    ? null
    : { code: deployed.code, reason: deployed.reason }
}

/** A policy refusal over a host a newer OpenKodo runs gets its own code: an Update cannot pass it. */
export async function wslOpenkododDeferralCode(
  slot: OpenkododSlotOptions,
  deployed: { code: string; fullVersion: string },
  appVersion: string
): Promise<string> {
  if (deployed.code !== OPENKODOD_ACTIVATION_POLICY_REFUSED_CODE) {
    return deployed.code
  }
  const record = await readOpenkododActivationRecord(slot).catch(() => null)
  return record && refuseOpenkododHostDowngrade(record, deployed.fullVersion, appVersion)
    ? OPENKODOD_HOST_NEWER_DEFERRAL_CODE
    : deployed.code
}

/** The record only once the incumbent is back and no journal awaits recovery; else null. */
export async function readRestoredWslOpenkododRecord(
  slot: OpenkododSlotOptions,
  incumbent: string
): Promise<OpenkododActivationRecord | null> {
  // Unreadable transaction state proves no restoration; preserve the rejection.
  if (await readOpenkododActivationTransaction(slot).catch(() => true)) {
    return null
  }
  const record = await readOpenkododActivationRecord(slot).catch(() => null)
  return record?.active === incumbent ? record : null
}
