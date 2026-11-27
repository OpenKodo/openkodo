import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { OpenkododMigrationManifest } from '../../../../shared/openkodod-migration/openkodod-migration-manifest'
import {
  decodeOpenkododMigrationSnapshotChunk,
  type OpenkododMigrationSnapshotChunkRequest,
  type OpenkododMigrationSnapshotChunkResult,
  type OpenkododMigrationSnapshotUploadState,
  type OpenkododMigrationTerminalScrollbackSnapshot
} from '../../../../shared/openkodod-migration/openkodod-migration-scrollback'
import { syncDirectoryDurablySync } from '../../../filesystem/durable-file-write'
import {
  getTerminalScrollbackSnapshotPath,
  getTerminalScrollbackSnapshotRoot,
  type TerminalScrollbackSnapshotStorage
} from '../../../pty/scrollback/terminal-scrollback-snapshots'
import {
  appendOpenkododMigrationStagedChunk,
  ensureOpenkododMigrationDirectory,
  inspectOpenkododMigrationFinalFile,
  linkOpenkododMigrationStagedFile,
  openkododMigrationFileMatches,
  openkododMigrationStagedFileSize,
  openkododMigrationStagingDirectory,
  pruneOpenkododMigrationStagingDirectories,
  removeOpenkododMigrationStagingDirectory,
  requireStagedOpenkododMigrationManifest
} from '../blob-transfer/openkodod-migration-staged-file'

/** Only the staged manifest's snapshots may receive chunks; retried ranges must match. */
export function stageOpenkododMigrationSnapshotChunk(args: {
  stagedManifest: OpenkododMigrationManifest | null
  storage: TerminalScrollbackSnapshotStorage
  request: OpenkododMigrationSnapshotChunkRequest
}): OpenkododMigrationSnapshotChunkResult {
  const manifest = requireStagedOpenkododMigrationManifest(
    args.stagedManifest,
    args.request,
    'openkodod_migration_snapshot_catalog_not_staged'
  )
  const descriptor = requireDescriptor(manifest, args.request.ref)
  const bytes = decodeOpenkododMigrationSnapshotChunk(args.request.bytesBase64)
  ensureOpenkododMigrationDirectory(stagingDirectory(args.storage, manifest))
  const acknowledgedOffset = appendOpenkododMigrationStagedChunk({
    channel: 'snapshot',
    path: stagedSnapshotPath(args.storage, manifest, descriptor),
    offset: args.request.offset,
    bytes,
    byteLength: descriptor.byteLength
  })
  return {
    migrationId: args.request.migrationId,
    manifestSha256: args.request.manifestSha256,
    ref: args.request.ref,
    acknowledgedOffset
  }
}

export function inspectOpenkododMigrationSnapshotUploads(
  manifest: OpenkododMigrationManifest,
  storage: TerminalScrollbackSnapshotStorage
): OpenkododMigrationSnapshotUploadState[] | undefined {
  const snapshots = manifest.payload.dormantState?.terminalScrollbackSnapshots ?? []
  if (snapshots.length === 0) {
    return undefined
  }
  return snapshots.map((descriptor) => ({
    ...descriptor,
    receivedBytes:
      inspectFinalSnapshot(storage, descriptor) === 'matching'
        ? descriptor.byteLength
        : openkododMigrationStagedFileSize(
            stagedSnapshotPath(storage, manifest, descriptor),
            descriptor.byteLength
          )
  }))
}

export function assertOpenkododMigrationSnapshotsReady(
  manifest: OpenkododMigrationManifest,
  storage: TerminalScrollbackSnapshotStorage
): void {
  for (const upload of inspectOpenkododMigrationSnapshotUploads(manifest, storage) ?? []) {
    const finalStatus = inspectFinalSnapshot(storage, upload)
    if (finalStatus === 'conflict') {
      throw new Error(`openkodod_migration_snapshot_destination_conflict:${upload.ref}`)
    }
    if (upload.receivedBytes !== upload.byteLength) {
      throw new Error(`openkodod_migration_snapshot_incomplete:${upload.ref}`)
    }
    const path =
      finalStatus === 'matching'
        ? getTerminalScrollbackSnapshotPath(upload.ref, storage)
        : stagedSnapshotPath(storage, manifest, upload)
    if (!path || !openkododMigrationFileMatches(path, upload)) {
      throw new Error(`openkodod_migration_snapshot_digest_mismatch:${upload.ref}`)
    }
  }
}

export function commitOpenkododMigrationSnapshots(
  manifest: OpenkododMigrationManifest,
  storage: TerminalScrollbackSnapshotStorage
): void {
  const snapshots = manifest.payload.dormantState?.terminalScrollbackSnapshots ?? []
  assertOpenkododMigrationSnapshotsReady(manifest, storage)
  const root = getTerminalScrollbackSnapshotRoot(storage)
  mkdirSync(root, { recursive: true, mode: 0o700 })
  for (const descriptor of snapshots) {
    const finalPath = getTerminalScrollbackSnapshotPath(descriptor.ref, storage)
    if (!finalPath) {
      throw new Error('openkodod_migration_snapshot_ref_invalid')
    }
    linkOpenkododMigrationStagedFile({
      stagedPath: stagedSnapshotPath(storage, manifest, descriptor),
      finalPath,
      expected: descriptor,
      conflictError: `openkodod_migration_snapshot_destination_conflict:${descriptor.ref}`
    })
  }
  syncDirectoryDurablySync(root)
  removeOpenkododMigrationStagingDirectory(root, manifest)
}

export function abortOpenkododMigrationSnapshots(
  manifest: OpenkododMigrationManifest,
  storage: TerminalScrollbackSnapshotStorage
): void {
  removeOpenkododMigrationStagingDirectory(getTerminalScrollbackSnapshotRoot(storage), manifest)
}

export function pruneOpenkododMigrationSnapshotStaging(
  stagedManifests: readonly OpenkododMigrationManifest[],
  storage: TerminalScrollbackSnapshotStorage
): void {
  pruneOpenkododMigrationStagingDirectories(
    getTerminalScrollbackSnapshotRoot(storage),
    stagedManifests
  )
}

function requireDescriptor(
  manifest: OpenkododMigrationManifest,
  ref: string
): OpenkododMigrationTerminalScrollbackSnapshot {
  const descriptor = manifest.payload.dormantState?.terminalScrollbackSnapshots?.find(
    (entry) => entry.ref === ref
  )
  if (!descriptor) {
    throw new Error('openkodod_migration_snapshot_unknown')
  }
  return descriptor
}

function inspectFinalSnapshot(
  storage: TerminalScrollbackSnapshotStorage,
  descriptor: OpenkododMigrationTerminalScrollbackSnapshot
): 'absent' | 'matching' | 'conflict' {
  return inspectOpenkododMigrationFinalFile(
    getTerminalScrollbackSnapshotPath(descriptor.ref, storage),
    descriptor
  )
}

function stagingDirectory(
  storage: TerminalScrollbackSnapshotStorage,
  manifest: OpenkododMigrationManifest
): string {
  return openkododMigrationStagingDirectory(getTerminalScrollbackSnapshotRoot(storage), manifest)
}

function stagedSnapshotPath(
  storage: TerminalScrollbackSnapshotStorage,
  manifest: OpenkododMigrationManifest,
  descriptor: OpenkododMigrationTerminalScrollbackSnapshot
): string {
  return join(stagingDirectory(storage, manifest), `${descriptor.ref}.${descriptor.sha256}.part`)
}
