import type { OpenkododMigrationManifest } from '../../../../shared/openkodod-migration/openkodod-migration-manifest'
import {
  REMOTE_RUNTIME_MAX_INBOUND_REQUEST_JSON_BYTES,
  REMOTE_RUNTIME_REQUEST_ENVELOPE_RESERVE_BYTES
} from '../../../../shared/remote-runtime/remote-runtime-memory-limits'
import { describeOversizedOpenkododMigrationPayload } from './openkodod-migration-payload-capacity'

/** The largest catalog-request params that still fit the host's sealed inbound frame. */
export const OPENKODOD_MIGRATION_REQUEST_PARAMS_BUDGET_BYTES =
  REMOTE_RUNTIME_MAX_INBOUND_REQUEST_JSON_BYTES - REMOTE_RUNTIME_REQUEST_ENVELOPE_RESERVE_BYTES

/** Reject oversized manifest requests before fencing: stage/state/full abort would all exceed the sealed frame and close its socket. */
export function assertOpenkododMigrationRequestFits(params: {
  manifest: OpenkododMigrationManifest
}): void {
  if (!openkododMigrationRequestFits(params)) {
    throw new Error(
      describeOversizedOpenkododMigrationPayload(
        params.manifest.payload,
        OPENKODOD_MIGRATION_REQUEST_PARAMS_BUDGET_BYTES
      )
    )
  }
}

export function openkododMigrationRequestFits(params: {
  manifest: OpenkododMigrationManifest
}): boolean {
  return (
    Buffer.byteLength(JSON.stringify(params), 'utf8') <=
    OPENKODOD_MIGRATION_REQUEST_PARAMS_BUDGET_BYTES
  )
}
