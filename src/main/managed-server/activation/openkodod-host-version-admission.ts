/** Reject activation over state a newer host build may already have migrated. */
import { compareAppVersions } from '../../../shared/app-lifecycle/identity/app-version'
import type { OpenkododActivationRecord } from './openkodod-activation-record'

export type OpenkododHostVersionRefusal = 'host-newer'

export function refuseOpenkododHostDowngrade(
  record: OpenkododActivationRecord,
  candidateVersion: string,
  appVersion: string
): OpenkododHostVersionRefusal | null {
  // Restarting the stopped build cannot downgrade state.
  if (record.active === null && record.previous === candidateVersion) {
    return null
  }
  // Older Stop records omit app version; refuse only proven newer hosts or they would be stranded.
  if (!record.activeAppVersion) {
    return null
  }
  return compareAppVersions(record.activeAppVersion, appVersion) > 0 ? 'host-newer' : null
}
