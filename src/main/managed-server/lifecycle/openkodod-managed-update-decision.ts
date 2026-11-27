import {
  compareAppVersions,
  isValidAppVersion
} from '../../../shared/app-lifecycle/identity/app-version'
import type { OpenkododManagedPastLiveTerminals } from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-managed-runtime'
import type { OpenkododActivationRecord } from '../activation/openkodod-activation-record'
import type { OpenkododUpdateForce } from '../activation/openkodod-update-plan'
import {
  refuseOpenkododHostDowngrade,
  type OpenkododHostVersionRefusal
} from '../activation/openkodod-host-version-admission'

export type ManagedOpenkododAutoUpdateSkip =
  | 'current'
  | 'no-template'
  | 'rolled-back'
  | 'failed-before'
  | 'migrating'
  | OpenkododHostVersionRefusal

/** Connect honors all skips; Update retries local failures/rollbacks; Force also lifts version skips. */
export type OpenkododUpdateIntent = 'connect' | 'update' | 'force'

export type ManagedOpenkododAutoUpdatePlan =
  | { action: 'update' }
  | { action: 'skip'; reason: ManagedOpenkododAutoUpdateSkip }

export function planManagedOpenkododAutoUpdate(input: {
  record: OpenkododActivationRecord
  candidateVersion: string | null
  appVersion: string
  failedBefore: boolean
}): ManagedOpenkododAutoUpdatePlan {
  const { record, candidateVersion } = input
  if (!candidateVersion) {
    return { action: 'skip', reason: 'no-template' }
  }
  if (record.active === candidateVersion) {
    return { action: 'skip', reason: 'current' }
  }
  if (record.rolledBackFrom === candidateVersion) {
    return { action: 'skip', reason: 'rolled-back' }
  }
  const refusal = refuseOpenkododHostDowngrade(record, candidateVersion, input.appVersion)
  if (refusal) {
    return { action: 'skip', reason: refusal }
  }
  // A stopped host has no serving fallback; retry even after a prior failed attempt.
  if (record.active === null && record.previous !== null) {
    return { action: 'update' }
  }
  return input.failedBefore ? { action: 'skip', reason: 'failed-before' } : { action: 'update' }
}

export function planOpenkododUpdateForIntent(
  intent: OpenkododUpdateIntent,
  input: Parameters<typeof planManagedOpenkododAutoUpdate>[0]
): ManagedOpenkododAutoUpdatePlan {
  if (intent === 'force') {
    return { action: 'update' }
  }
  if (intent === 'connect') {
    return planManagedOpenkododAutoUpdate(input)
  }
  const { rolledBackFrom: _retried, ...record } = input.record
  return planManagedOpenkododAutoUpdate({ ...input, record, failedBefore: false })
}

/** Full force over an uncounted census ends terminals openkodod runs itself, so it needs a confirmation, never a bare force. */
export function managedOpenkododUpdateForce(input: {
  force?: boolean
  pastLiveTerminals?: OpenkododManagedPastLiveTerminals
  /** The caller confirmed terminals openkodod runs itself end, as CLI `--force --yes` does. */
  endInProcessTerminals?: boolean
}): OpenkododUpdateForce | undefined {
  if (input.pastLiveTerminals) {
    return input.pastLiveTerminals.uncounted ? true : 'live-terminals'
  }
  if (!input.force) {
    return input.force
  }
  return input.endInProcessTerminals === true ? true : 'live-terminals'
}

export function admitOpenkododRecordForIntent(
  intent: OpenkododUpdateIntent,
  appVersion: string
): (record: OpenkododActivationRecord, candidateVersion: string) => string | null {
  return (record, candidateVersion) =>
    openkododUpdateSkipRefusal(
      planOpenkododUpdateForIntent(intent, {
        record,
        candidateVersion,
        appVersion,
        failedBefore: false
      }),
      record,
      candidateVersion,
      appVersion
    )
}

export function openkododUpdateSkipRefusal(
  plan: ManagedOpenkododAutoUpdatePlan,
  record: OpenkododActivationRecord,
  candidateVersion: string,
  appVersion: string
): string | null {
  if (plan.action !== 'skip' || plan.reason === 'current') {
    return null
  }
  return plan.reason === 'rolled-back'
    ? `This host's server rolled back from ${candidateVersion}, so a connect does not activate ` +
        'it again; choose Update or Force to retry it.'
    : `OpenKodo ${record.activeAppVersion} last ran this host's server, newer than this ` +
        `OpenKodo (${appVersion}). Update OpenKodo to start it.`
}

/** Content hashes cannot order updates: compare OpenKodo versions, or for legacy hosts offer only this desktop's previously deferred build. */
export function availableManagedOpenkododUpdate(input: {
  record: OpenkododActivationRecord
  candidateVersion: string | null
  appVersion: string
  /** The build this desktop's last Update or connect deferred on this host. */
  deferredCandidateVersion: string | null
}): string | null {
  const { record, candidateVersion, appVersion } = input
  const hostAppVersion = record.activeAppVersion
  if (!candidateVersion || record.active === null || !isValidAppVersion(appVersion)) {
    return null
  }
  const ordered = hostAppVersion
    ? isValidAppVersion(hostAppVersion) && compareAppVersions(appVersion, hostAppVersion) >= 0
    : input.deferredCandidateVersion === candidateVersion
  if (!ordered) {
    return null
  }
  // Connect rules: a build the user rolled back from is not advertised again.
  const plan = planManagedOpenkododAutoUpdate({
    record,
    candidateVersion,
    appVersion,
    failedBefore: false
  })
  return plan.action === 'update' ? candidateVersion : null
}

/** Update anyway was confirmed over one incumbent build; a build activated since then voids it. */
export function admitConfirmedIncumbent(
  admit: (record: OpenkododActivationRecord, candidateVersion: string) => string | null,
  incumbentVersion: string | null
): (record: OpenkododActivationRecord, candidateVersion: string) => string | null {
  return (record, candidateVersion) =>
    record.active !== incumbentVersion
      ? "This host's server changed since the update was confirmed. Review it and update again."
      : admit(record, candidateVersion)
}
