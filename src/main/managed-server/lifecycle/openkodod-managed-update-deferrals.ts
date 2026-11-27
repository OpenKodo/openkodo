import type { OpenkododManagedDeferral } from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-managed-runtime'
import type { OpenkododActivationRecord } from '../activation/openkodod-activation-record'

type RecordedDeferral = OpenkododManagedDeferral & { deferredAt: string }

/** Which activation a host is on: a version alone repeats when a host moves away and back. */
export type OpenkododIncumbent = Pick<OpenkododActivationRecord, 'active' | 'activatedAt'>

type StoredDeferral = RecordedDeferral & {
  /** The host's activation when the deferral was recorded. */
  incumbentAtDeferral: OpenkododIncumbent
}

const deferrals = new Map<string, StoredDeferral>()

export function recordManagedOpenkododUpdateDeferral(
  environmentId: string,
  deferral: OpenkododManagedDeferral,
  incumbent: OpenkododIncumbent,
  now = new Date()
): void {
  deferrals.set(environmentId, {
    ...deferral,
    deferredAt: now.toISOString(),
    incumbentAtDeferral: { active: incumbent.active, activatedAt: incumbent.activatedAt }
  })
}

export function clearManagedOpenkododUpdateDeferral(environmentId: string): void {
  deferrals.delete(environmentId)
}

/** Forget a deferral once the host's activation moves, since it described a host state that is gone
 *  (builds of one release differ only by an unorderable content hash, #38400), or once its candidate
 *  is the build the host runs, since nothing is left to update. */
export function currentManagedOpenkododUpdateDeferral(
  environmentId: string,
  incumbent: OpenkododIncumbent
): RecordedDeferral | null {
  const stored = deferrals.get(environmentId)
  if (!stored) {
    return null
  }
  const { incumbentAtDeferral, ...deferral } = stored
  if (
    incumbent.active === deferral.candidateVersion ||
    incumbentAtDeferral.active !== incumbent.active ||
    incumbentAtDeferral.activatedAt !== incumbent.activatedAt
  ) {
    clearManagedOpenkododUpdateDeferral(environmentId)
    return null
  }
  return deferral
}
