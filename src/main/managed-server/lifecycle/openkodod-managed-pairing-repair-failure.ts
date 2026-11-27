export const OPENKODOD_PAIRING_REPAIR_FAILED_CODE = 'openkodod_pairing_repair_failed'

export class OpenkododManagedPairingRepairFailedError extends Error {
  readonly code = OPENKODOD_PAIRING_REPAIR_FAILED_CODE
  constructor(reason: string) {
    super(
      `${OPENKODOD_PAIRING_REPAIR_FAILED_CODE}: the OpenKodo server on this host no longer accepts this ` +
        `computer, and OpenKodo couldn't pair with it again over SSH: ${reason}. Nothing on the host ` +
        `was stopped; its terminals can't be verified until OpenKodo pairs again. Connect again to retry.`
    )
    this.name = 'OpenkododManagedPairingRepairFailedError'
  }
}
