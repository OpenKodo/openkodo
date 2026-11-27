/** A slot this connect uploaded whose candidate then failed its start check is deleted, so the next connect re-uploads it instead of relaunching the same broken bytes. */
import { readOpenkododActivationRecord } from '../../managed-server/activation/openkodod-activation-record-store'
import { openkododGcPinnedDirNames } from '../../managed-server/activation/openkodod-activation-record'
import {
  probeOpenkododSlotReadiness,
  provenLiveDaemonVersion
} from '../../managed-server/lifecycle/openkodod-managed-version-gc'
import { withOpenkododActivationLock } from '../../managed-server/activation/openkodod-activation-lock'
import { removeRemoteInstallVersionDir } from '../../managed-server/install/remote-install-gc'
import {
  OPENKODOD_INSTALL_MODEL,
  remoteInstallDirName
} from '../../managed-server/install/remote-install-model'
import { readOpenkododGcTransactionPins } from '../../managed-server/activation/openkodod-gc-transaction-pins'
import {
  openkododSlotDir,
  type OpenkododSlotOptions
} from '../../managed-server/activation/openkodod-recovery-slot'
import type { OpenkododDeployResult } from '../../managed-server/install/openkodod-remote-deploy'
import { isWslOpenkododSlotInUse } from './wsl-openkodod-slot-process-probe'

export async function removeFailedFreshWslOpenkododInstall(
  slot: OpenkododSlotOptions,
  deployed: OpenkododDeployResult
): Promise<void> {
  if (
    deployed.outcome !== 'installed-not-activated' ||
    !deployed.startCheckFailed ||
    !deployed.freshlyInstalled
  ) {
    return
  }
  const version = deployed.fullVersion
  try {
    // Under the activation fence, so no activator can preflight or launch this slot meanwhile.
    const outcome = await withOpenkododActivationLock(
      slot,
      async () => {
        if (!(await mayRemove(slot, version))) {
          return 'pinned'
        }
        const removed = await removeRemoteInstallVersionDir(
          slot.conn,
          OPENKODOD_INSTALL_MODEL,
          openkododSlotDir(slot, version),
          slot.host,
          { isDirLive: (dir) => isWslOpenkododSlotInUse(slot, dir) }
        )
        return removed ? 'removed' : 'in-use'
      },
      () => 'fenced'
    )
    console.warn(
      outcome === 'removed'
        ? `[wsl-openkodod] Removed openkodod ${version}, which failed its start check after install.`
        : `[wsl-openkodod] Kept failed openkodod ${version} (${outcome}): it may still be in use.`
    )
  } catch (error) {
    // The connect already failed; a cleanup error must not replace its reason.
    console.warn(`[wsl-openkodod] Could not remove failed openkodod ${version}:`, error)
  }
}

/** The GC's pins: active, rollback target, the active daemon's build and any journaled slot. */
async function mayRemove(slot: OpenkododSlotOptions, version: string): Promise<boolean> {
  const dirName = remoteInstallDirName(OPENKODOD_INSTALL_MODEL, version)
  const record = await readOpenkododActivationRecord(slot)
  // Nothing active serves terminals; a daemon the rejected candidate left here is caught by the process probe.
  const liveDaemonVersion = record.active
    ? provenLiveDaemonVersion(await probeOpenkododSlotReadiness(slot, record.active))
    : null
  if (liveDaemonVersion === undefined) {
    return false
  }
  if (openkododGcPinnedDirNames(record, liveDaemonVersion).includes(dirName)) {
    return false
  }
  const transaction = await readOpenkododGcTransactionPins(slot, { callerHoldsFence: true })
  return transaction.state === 'pinned' && !transaction.dirNames.includes(dirName)
}
