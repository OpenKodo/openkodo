import { parseOpenkododMigrationSnapshotChunkResult } from '../../../../shared/openkodod-migration/openkodod-migration-scrollback'
import type {
  OpenkododMigrationSnapshotChunkRequest,
  OpenkododMigrationSnapshotChunkResult
} from '../../../../shared/openkodod-migration/openkodod-migration-scrollback'

import {
  findUnsupportedMigrationBlobKind,
  openkododMigrationBlobKindUnsupportedBlocker,
  parseOpenkododMigrationBlobChunkResult
} from '../../../../shared/openkodod-migration/openkodod-migration-blob-transfer'

import type {
  OpenkododMigrationBlobChunkRequest,
  OpenkododMigrationBlobChunkResult
} from '../../../../shared/openkodod-migration/openkodod-migration-blob-transfer'

import { parsePairingCode } from '../../../../shared/remote-runtime/pairing/pairing'
import type { CatalogRequestOptions } from '../catalog/openkodod-migration-request'
import { sendSupportedMigrationRequest } from '../catalog/openkodod-migration-request'

export async function stageRemoteOpenkododMigrationSnapshotChunk(
  pairingCode: string,
  request: OpenkododMigrationSnapshotChunkRequest,
  options: CatalogRequestOptions = {}
): Promise<OpenkododMigrationSnapshotChunkResult> {
  const pairing = parsePairingCode(pairingCode)
  if (!pairing) {
    throw new Error('openkodod_migration_pairing_code_invalid')
  }
  const response = await sendSupportedMigrationRequest(
    pairing,
    'openkodod.migration.stageSnapshotChunk',
    request,
    options
  )
  if (!response.ok) {
    throw new Error(`openkodod_migration_snapshot_failed:${response.error.message}`)
  }
  return parseOpenkododMigrationSnapshotChunkResult(response.result, request)
}

export async function stageRemoteOpenkododMigrationBlobChunk(
  pairingCode: string,
  request: OpenkododMigrationBlobChunkRequest,
  options: CatalogRequestOptions = {}
): Promise<OpenkododMigrationBlobChunkResult> {
  const pairing = parsePairingCode(pairingCode)
  if (!pairing) {
    throw new Error('openkodod_migration_pairing_code_invalid')
  }
  const response = await sendSupportedMigrationRequest(
    pairing,
    'openkodod.migration.stageBlobChunk',
    request,
    options,
    false,
    null,
    // Recheck every request so a downgraded destination cannot stage an unsupported blob kind.
    (capabilities) => {
      const unsupported = findUnsupportedMigrationBlobKind([request.blob], capabilities)
      if (unsupported) {
        throw new Error(openkododMigrationBlobKindUnsupportedBlocker(unsupported))
      }
    }
  )
  if (!response.ok) {
    throw new Error(`openkodod_migration_blob_failed:${response.error.message}`)
  }
  return parseOpenkododMigrationBlobChunkResult(response.result, request)
}
