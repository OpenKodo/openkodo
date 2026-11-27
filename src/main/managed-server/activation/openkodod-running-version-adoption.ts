/** Pair with an already-running foreign build before considering update; an unpaired first deploy cannot census its terminals. */
import type { ServeReadiness } from '../../server/serve-readiness'
import type { OpenkododManagedDeferral } from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-managed-runtime'
import { openkododActivationFenceRefusal } from './openkodod-activation-fence-hold'
import {
  OpenkododActiveReadinessError,
  probeActiveOpenkododReadiness
} from './openkodod-active-readiness'
import type { OpenkododActivationRecord } from './openkodod-activation-record'
import { readOpenkododActivationRecord } from './openkodod-activation-record-store'
import { wakeStoppedManagedOpenkodod } from '../lifecycle/openkodod-managed-wake'
import { resolveOpenkododSlotIdentity, type OpenkododSlotOptions } from './openkodod-recovery-slot'

export type OpenkododRunningAdoption = {
  version: string
  readiness: ServeReadiness
  /** Reads the adopted slot's readiness again, e.g. after it rebinds its port. */
  reprobe: () => Promise<ServeReadiness>
}

/** No foreign activation returns null for normal deploy. A held peer fence defers: deploying without pairing would only fail census (#28833). */
export async function adoptRunningOpenkododVersion(
  slot: OpenkododSlotOptions,
  record: OpenkododActivationRecord,
  localVersion: string,
  retryClearedFence = true
): Promise<OpenkododRunningAdoption | OpenkododManagedDeferral | null> {
  if (!record.active || record.active === localVersion) {
    return null
  }
  // Wake only on proven server exit; idle stops leave daemon terminals alive.
  const wake = await wakeStoppedManagedOpenkodod(slot)
  switch (wake.outcome) {
    // Another desktop stopped it meanwhile; the deploy's own gates decide.
    case 'not-activated':
      return null
    case 'fenced': {
      // E.g. another desktop starting it after a reboot; a later connect pairs with it.
      const { cleared, ...refusal } = await openkododActivationFenceRefusal(slot, 'server start')
      if (cleared && retryClearedFence) {
        return adoptRunningOpenkododVersion(slot, record, localVersion, false)
      }
      return { outcome: 'deferred', candidateVersion: localVersion, ...refusal, forceable: false }
    }
    case 'unverifiable':
      throw new OpenkododActiveReadinessError(
        'unverifiable',
        `OpenKodo ${record.active} runs this host's server, but its process state is unverifiable, ` +
          'so it was left as it is. Try connecting again.'
      )
    case 'recovery-refused':
      throw new Error(wake.reason)
    case 'serving':
    case 'started':
      break
  }
  // Re-read activation because wake follows peer changes to the current record.
  const active = (await readOpenkododActivationRecord(slot)).active
  if (!active || active === localVersion) {
    return null
  }
  const identity = await resolveOpenkododSlotIdentity(slot, active)
  const reprobe = () =>
    probeActiveOpenkododReadiness(
      { ...slot, remoteInstallDir: identity.remoteDir },
      { buildHash: identity.buildHash, fullVersion: identity.version }
    )
  return { version: active, readiness: await reprobe(), reprobe }
}
