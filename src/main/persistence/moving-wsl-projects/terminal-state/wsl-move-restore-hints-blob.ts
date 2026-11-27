import { createHash } from 'node:crypto'

import {
  type OpenkododMigrationBlobDescriptor,
  sameOpenkododMigrationBlob
} from '../../../../shared/openkodod-migration/openkodod-migration-blob-transfer'
import {
  MAX_OPENKODOD_MIGRATION_TERMINAL_RESTORE_HINTS_BYTES,
  OPENKODOD_MIGRATION_TERMINAL_RESTORE_HINTS_KEY,
  OPENKODOD_MIGRATION_TERMINAL_RESTORE_HINTS_VERSION,
  parseOpenkododMigrationTerminalRestoreHintsDocument,
  type OpenkododMigrationTerminalRestoreHint
} from '../../../../shared/openkodod-migration/openkodod-migration-terminal-restore-hints'
import type { OpenkododMigrationBlobSource } from '../../../managed-server/migration/transfers/openkodod-migration-blob-coordinator'

export type WslMoveRestoreHintsBlob = {
  descriptor: OpenkododMigrationBlobDescriptor
  bytes: Buffer
  source: OpenkododMigrationBlobSource
}

/** Omit the blob when there are no hints. */
export function buildWslMoveRestoreHintsBlob(
  hints: readonly OpenkododMigrationTerminalRestoreHint[]
): WslMoveRestoreHintsBlob | null {
  if (hints.length === 0) {
    return null
  }
  // Validate before staging so malformed hints fail while the source still owns the move.
  const document = parseOpenkododMigrationTerminalRestoreHintsDocument({
    version: OPENKODOD_MIGRATION_TERMINAL_RESTORE_HINTS_VERSION,
    hints: hints.map((hint) => ({ paneKey: hint.paneKey, cwd: hint.cwd }))
  })
  const bytes = Buffer.from(JSON.stringify(document), 'utf8')
  if (bytes.length > MAX_OPENKODOD_MIGRATION_TERMINAL_RESTORE_HINTS_BYTES) {
    throw new Error('openkodod_migration_terminal_restore_hints_too_large')
  }
  const descriptor: OpenkododMigrationBlobDescriptor = {
    blobKind: 'terminal-restore-hints',
    key: OPENKODOD_MIGRATION_TERMINAL_RESTORE_HINTS_KEY,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    byteLength: bytes.length
  }
  return {
    descriptor,
    bytes,
    source: {
      readChunk: async (requested, offset, maxBytes) => {
        if (!sameOpenkododMigrationBlob(requested, descriptor)) {
          throw new Error(`openkodod_migration_source_blob_changed:${requested.blobKind}`)
        }
        return bytes.subarray(offset, offset + maxBytes)
      }
    }
  }
}
