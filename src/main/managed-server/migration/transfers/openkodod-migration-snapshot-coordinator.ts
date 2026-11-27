/** Read snapshot chunks from source storage and verify manifest length/digest. Resume from destination offsets; re-read after lost acknowledgements instead of assuming delivery. This transport-independent driver retires nothing. */
import type {
  OpenkododMigrationCatalogState,
  OpenkododMigrationManifest
} from '../../../../shared/openkodod-migration/openkodod-migration-manifest'
import {
  decodeOpenkododMigrationSnapshotChunk,
  type OpenkododMigrationSnapshotChunkRequest,
  type OpenkododMigrationSnapshotChunkResult
} from '../../../../shared/openkodod-migration/openkodod-migration-scrollback'
import type { Store } from '../../../persistence/loading-store/store'

export type OpenkododMigrationSnapshotSource = Pick<
  Store,
  'readOpenkododMigrationSourceSnapshotChunk'
>

type OpenkododMigrationSnapshotDestination = {
  readState: (manifest: OpenkododMigrationManifest) => Promise<OpenkododMigrationCatalogState>
  stageChunk: (
    request: OpenkododMigrationSnapshotChunkRequest
  ) => Promise<OpenkododMigrationSnapshotChunkResult>
}

export async function transferOpenkododMigrationSnapshots(args: {
  source: OpenkododMigrationSnapshotSource
  manifest: OpenkododMigrationManifest
  state: Extract<OpenkododMigrationCatalogState, { state: 'staged' }>
  destination: OpenkododMigrationSnapshotDestination
}): Promise<void> {
  const snapshots = args.manifest.payload.dormantState?.terminalScrollbackSnapshots ?? []
  if (snapshots.length === 0) {
    return
  }
  // Journal retention keeps bytes available after tab close, including retries.
  await sendSnapshots(args, snapshots)
}

async function sendSnapshots(
  args: Parameters<typeof transferOpenkododMigrationSnapshots>[0],
  snapshots: NonNullable<
    NonNullable<
      OpenkododMigrationManifest['payload']['dormantState']
    >['terminalScrollbackSnapshots']
  >
): Promise<void> {
  const offsets = new Map(
    (args.state.snapshotUploads ?? []).map((entry) => [entry.ref, entry.receivedBytes])
  )
  for (const snapshot of snapshots) {
    let offset = offsets.get(snapshot.ref)
    if (offset === undefined) {
      throw new Error('openkodod_migration_snapshot_transfer_unsupported')
    }
    while (offset < snapshot.byteLength) {
      const chunk = args.source.readOpenkododMigrationSourceSnapshotChunk(
        args.manifest,
        snapshot.ref,
        offset
      )
      if (chunk.totalBytes !== snapshot.byteLength || !chunk.bytesBase64) {
        throw new Error('openkodod_migration_source_snapshot_changed')
      }
      const request: OpenkododMigrationSnapshotChunkRequest = {
        migrationId: args.manifest.migrationId,
        manifestSha256: args.manifest.manifestSha256,
        ref: snapshot.ref,
        offset,
        bytesBase64: chunk.bytesBase64
      }
      const expectedOffset =
        offset + decodeOpenkododMigrationSnapshotChunk(chunk.bytesBase64).length
      offset = await stageChunkWithRecovery(args, request, expectedOffset)
    }
  }
  const verified = await args.destination.readState(args.manifest)
  if (
    verified.state !== 'staged' ||
    (verified.snapshotUploads ?? []).length !== snapshots.length ||
    (verified.snapshotUploads ?? []).some((entry) => entry.receivedBytes !== entry.byteLength)
  ) {
    throw new Error('openkodod_migration_snapshot_transfer_incomplete')
  }
}

async function stageChunkWithRecovery(
  args: {
    manifest: OpenkododMigrationManifest
    destination: OpenkododMigrationSnapshotDestination
  },
  request: OpenkododMigrationSnapshotChunkRequest,
  expectedOffset: number
): Promise<number> {
  try {
    const result = await args.destination.stageChunk(request)
    if (result.acknowledgedOffset !== expectedOffset) {
      throw new Error('openkodod_migration_snapshot_ack_invalid')
    }
    return result.acknowledgedOffset
  } catch (error) {
    try {
      const observed = await args.destination.readState(args.manifest)
      const received =
        observed.state === 'staged'
          ? observed.snapshotUploads?.find((entry) => entry.ref === request.ref)?.receivedBytes
          : undefined
      if (received === expectedOffset) {
        return received
      }
    } catch {
      // Unverifiable chunks retain the original failure.
    }
    throw error
  }
}
