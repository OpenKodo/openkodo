import { parseOpenkododMigrationCatalogReferenceAbortResult } from '../../../../shared/openkodod-migration/openkodod-migration-catalog-state'
import type {
  OpenkododMigrationCatalogReference,
  OpenkododMigrationCatalogReferenceAbortResult
} from '../../../../shared/openkodod-migration/openkodod-migration-manifest'
import { OPENKODOD_MIGRATION_CATALOG_ABORT_BY_REFERENCE_RUNTIME_CAPABILITY } from '../../../../shared/remote-runtime/protocol/openkodod-runtime-capabilities'
import { parsePairingCode } from '../../../../shared/remote-runtime/pairing/pairing'
import type { RuntimeRpcResponse } from '../../../../shared/remote-runtime/rpc/runtime-rpc-envelope'
import {
  OPENKODOD_MIGRATION_DESTINATION_UNSUPPORTED,
  sendSupportedMigrationRequest,
  type CatalogRequestOptions
} from './openkodod-migration-request'

/** Unlike migration-unsupported, this refusal cannot prove no earlier stage exists. */
export const OPENKODOD_MIGRATION_DESTINATION_ABORT_BY_REFERENCE_UNSUPPORTED =
  'openkodod_migration_destination_abort_by_reference_unsupported:Update OpenKodo on this host to cancel this move.'

/** Abort by manifest identity when the full request cannot fit the sealed frame. */
export async function abortRemoteOpenkododMigrationCatalogByReference(
  pairingCode: string,
  manifest: OpenkododMigrationCatalogReference,
  options: CatalogRequestOptions = {}
): Promise<OpenkododMigrationCatalogReferenceAbortResult> {
  const pairing = parsePairingCode(pairingCode)
  if (!pairing) {
    throw new Error('openkodod_migration_pairing_code_invalid')
  }
  let supportsReference = false
  let response: RuntimeRpcResponse<unknown>
  try {
    response = await sendSupportedMigrationRequest(
      pairing,
      'openkodod.migration.abortCatalogByReference',
      { migrationId: manifest.migrationId, manifestSha256: manifest.manifestSha256 },
      options,
      false,
      null,
      (capabilities) => {
        supportsReference = capabilities.includes(
          OPENKODOD_MIGRATION_CATALOG_ABORT_BY_REFERENCE_RUNTIME_CAPABILITY
        )
        if (!supportsReference) {
          throw new Error(OPENKODOD_MIGRATION_DESTINATION_ABORT_BY_REFERENCE_UNSUPPORTED)
        }
      }
    )
  } catch (error) {
    // A missing method on a host that advertised it proves nothing about what it staged.
    if (
      supportsReference &&
      error instanceof Error &&
      error.message === OPENKODOD_MIGRATION_DESTINATION_UNSUPPORTED
    ) {
      throw new Error(OPENKODOD_MIGRATION_DESTINATION_ABORT_BY_REFERENCE_UNSUPPORTED)
    }
    throw error
  }
  if (!response.ok) {
    throw new Error(`openkodod_migration_abort_failed:${response.error.message}`)
  }
  return parseOpenkododMigrationCatalogReferenceAbortResult(response.result, manifest)
}
