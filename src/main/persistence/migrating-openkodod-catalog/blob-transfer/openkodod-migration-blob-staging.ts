// The manifest omits blobs; descriptor filenames make staged uploads resumable after restart.
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  OPENKODOD_MIGRATION_BLOB_KINDS,
  assertOpenkododMigrationBlobSet,
  decodeOpenkododMigrationBlobChunk,
  openkododMigrationBlobIdentity,
  parseOpenkododMigrationBlobDescriptor,
  sameOpenkododMigrationBlob,
  type OpenkododMigrationBlobChunkRequest,
  type OpenkododMigrationBlobChunkResult,
  type OpenkododMigrationBlobDescriptor,
  type OpenkododMigrationBlobKind,
  type OpenkododMigrationBlobUploadState
} from '../../../../shared/openkodod-migration/openkodod-migration-blob-transfer'
import type { OpenkododMigrationManifest } from '../../../../shared/openkodod-migration/openkodod-migration-manifest'
import { syncDirectoryDurablySync } from '../../../filesystem/durable-file-write'
import {
  appendOpenkododMigrationStagedChunk,
  ensureOpenkododMigrationDirectory,
  inspectOpenkododMigrationFinalFile,
  linkOpenkododMigrationStagedFile,
  openkododMigrationFileMatches,
  openkododMigrationStagedFileSize,
  openkododMigrationStagingDirectory,
  openkododMigrationStagingKey,
  pruneOpenkododMigrationKeyedDirectories,
  pruneOpenkododMigrationStagingDirectories,
  removeOpenkododMigrationStagingDirectory,
  requireStagedOpenkododMigrationManifest,
  type OpenkododMigrationRequestIdentity
} from './openkodod-migration-staged-file'

const RECEIVED_DIRECTORY = 'received'
const STAGED_BLOB_NAME = /^([^.]+)\.([a-f0-9]{64})\.([1-9][0-9]*)\.part$/

type OpenkododMigrationBlobName = Pick<OpenkododMigrationBlobDescriptor, 'blobKind' | 'key'>

type ReceivedBlobPathResolver = (
  root: string,
  manifest: OpenkododMigrationRequestIdentity,
  descriptor: OpenkododMigrationBlobName
) => string

const receivedDirectoryPath: ReceivedBlobPathResolver = (root, manifest, descriptor) =>
  join(receivedBlobsDirectory(root, manifest), descriptor.blobKind, descriptor.key)

const RECEIVED_BLOB_DESTINATIONS: Record<OpenkododMigrationBlobKind, ReceivedBlobPathResolver> = {
  'terminal-restore-hints': receivedDirectoryPath,
  'shell-history': receivedDirectoryPath,
  'agent-session-records': receivedDirectoryPath,
  'terminal-history': receivedDirectoryPath,
  'automation-run-history': receivedDirectoryPath
}

export function getOpenkododMigrationReceivedBlobPath(
  root: string,
  manifest: OpenkododMigrationRequestIdentity,
  descriptor: OpenkododMigrationBlobName
): string {
  return RECEIVED_BLOB_DESTINATIONS[descriptor.blobKind](root, manifest, descriptor)
}

export function listOpenkododMigrationReceivedBlobNames(
  root: string,
  manifest: OpenkododMigrationRequestIdentity,
  blobKind: OpenkododMigrationBlobKind
): string[] {
  return readDirectory(join(receivedBlobsDirectory(root, manifest), blobKind))
}

export type OpenkododMigrationBlobChunkStaging = {
  stagedManifest: OpenkododMigrationManifest | null
  root: string
  request: OpenkododMigrationBlobChunkRequest
}

export function stageOpenkododMigrationBlobChunk(
  args: OpenkododMigrationBlobChunkStaging
): OpenkododMigrationBlobChunkResult {
  const manifest = requireStagedOpenkododMigrationManifest(
    args.stagedManifest,
    args.request,
    'openkodod_migration_blob_catalog_not_staged'
  )
  const descriptor = parseOpenkododMigrationBlobDescriptor(args.request.blob)
  const bytes = decodeOpenkododMigrationBlobChunk(args.request.bytesBase64)
  const staged = stagedBlobDescriptors(args.root, manifest)
  const existing = staged.find(
    (entry) => openkododMigrationBlobIdentity(entry) === openkododMigrationBlobIdentity(descriptor)
  )
  if (existing && !sameOpenkododMigrationBlob(existing, descriptor)) {
    // Replacing staged bytes requires abort and restage.
    throw new Error(`openkodod_migration_blob_descriptor_conflict:${descriptor.blobKind}`)
  }
  if (!existing) {
    assertOpenkododMigrationBlobSet([...staged, descriptor])
  }
  const path = stagedBlobPath(args.root, manifest, descriptor)
  ensureOpenkododMigrationDirectory(dirname(path))
  const receivedBytes = appendOpenkododMigrationStagedChunk({
    channel: 'blob',
    path,
    offset: args.request.offset,
    bytes,
    byteLength: descriptor.byteLength
  })
  return {
    migrationId: args.request.migrationId,
    manifestSha256: args.request.manifestSha256,
    blobKind: descriptor.blobKind,
    key: descriptor.key,
    receivedBytes
  }
}

export function inspectOpenkododMigrationBlobUploads(
  manifest: OpenkododMigrationManifest,
  root: string
): OpenkododMigrationBlobUploadState[] | undefined {
  const uploads = stagedBlobDescriptors(root, manifest).map((descriptor) => ({
    ...descriptor,
    receivedBytes:
      inspectReceivedBlob(root, manifest, descriptor) === 'matching'
        ? descriptor.byteLength
        : openkododMigrationStagedFileSize(
            stagedBlobPath(root, manifest, descriptor),
            descriptor.byteLength
          )
  }))
  return uploads.length > 0 ? uploads : undefined
}

export function assertOpenkododMigrationBlobsReady(
  manifest: OpenkododMigrationManifest,
  root: string
): void {
  for (const upload of inspectOpenkododMigrationBlobUploads(manifest, root) ?? []) {
    const label = `${upload.blobKind}:${upload.key}`
    const finalStatus = inspectReceivedBlob(root, manifest, upload)
    if (finalStatus === 'conflict') {
      throw new Error(`openkodod_migration_blob_destination_conflict:${label}`)
    }
    if (upload.receivedBytes !== upload.byteLength) {
      throw new Error(`openkodod_migration_blob_incomplete:${label}`)
    }
    if (
      finalStatus !== 'matching' &&
      !openkododMigrationFileMatches(stagedBlobPath(root, manifest, upload), upload)
    ) {
      throw new Error(`openkodod_migration_blob_digest_mismatch:${label}`)
    }
  }
}

/** Verified staged files; call after assertOpenkododMigrationBlobsReady in the same synchronous turn. */
export function stagedOpenkododMigrationBlobFiles(
  manifest: OpenkododMigrationManifest,
  root: string
): { descriptor: OpenkododMigrationBlobDescriptor; path: string }[] {
  return stagedBlobDescriptors(root, manifest).map((descriptor) => ({
    descriptor,
    path: stagedBlobPath(root, manifest, descriptor)
  }))
}

/** A blob's verified bytes, staged or already moved to received by an earlier commit attempt. */
export function readOpenkododMigrationBlob(
  manifest: OpenkododMigrationManifest,
  root: string,
  descriptor: OpenkododMigrationBlobDescriptor
): Buffer {
  for (const path of [
    stagedBlobPath(root, manifest, descriptor),
    getOpenkododMigrationReceivedBlobPath(root, manifest, descriptor)
  ]) {
    if (openkododMigrationFileMatches(path, descriptor)) {
      return readFileSync(path)
    }
  }
  throw new Error(`openkodod_migration_blob_incomplete:${descriptor.blobKind}:${descriptor.key}`)
}

/** Reject missing or extra blobs, including leftovers from another capture. */
export function assertOpenkododMigrationBlobSetMatches(
  manifest: OpenkododMigrationManifest,
  root: string,
  expected: readonly OpenkododMigrationBlobDescriptor[]
): void {
  assertOpenkododMigrationBlobSet(expected)
  const wanted = new Map(expected.map((entry) => [openkododMigrationBlobIdentity(entry), entry]))
  const staged = stagedBlobDescriptors(root, manifest)
  const stagedIds = new Set(staged.map(openkododMigrationBlobIdentity))
  for (const descriptor of staged) {
    const match = wanted.get(openkododMigrationBlobIdentity(descriptor))
    if (!match || !sameOpenkododMigrationBlob(match, descriptor)) {
      throw blobSetMismatch(descriptor)
    }
  }
  for (const identity of receivedBlobIdentities(root, manifest)) {
    if (!wanted.has(identity)) {
      throw new Error('openkodod_migration_blob_set_mismatch')
    }
  }
  for (const descriptor of expected) {
    // Previous commit attempts may have moved these bytes to received.
    if (
      !stagedIds.has(openkododMigrationBlobIdentity(descriptor)) &&
      inspectReceivedBlob(root, manifest, descriptor) !== 'matching'
    ) {
      throw blobSetMismatch(descriptor)
    }
  }
}

/** Call assertOpenkododMigrationBlobsReady in the same synchronous turn so no chunk can change verified bytes. */
export function commitOpenkododMigrationBlobs(
  manifest: OpenkododMigrationManifest,
  root: string
): void {
  const directories = new Set<string>()
  for (const descriptor of stagedBlobDescriptors(root, manifest)) {
    const finalPath = getOpenkododMigrationReceivedBlobPath(root, manifest, descriptor)
    ensureOpenkododMigrationDirectory(dirname(finalPath))
    linkOpenkododMigrationStagedFile({
      stagedPath: stagedBlobPath(root, manifest, descriptor),
      finalPath,
      expected: descriptor,
      conflictError: `openkodod_migration_blob_destination_conflict:${descriptor.blobKind}:${descriptor.key}`
    })
    directories.add(dirname(finalPath))
  }
  for (const directory of directories) {
    syncDirectoryDurablySync(directory)
  }
  removeOpenkododMigrationStagingDirectory(root, manifest)
}

/** Also remove blobs moved by a commit that never landed. */
export function abortOpenkododMigrationBlobs(
  manifest: OpenkododMigrationManifest,
  root: string
): void {
  removeOpenkododMigrationStagingDirectory(root, manifest)
  rmSync(receivedBlobsDirectory(root, manifest), { recursive: true, force: true })
}

export function pruneOpenkododMigrationBlobStaging(
  stagedManifests: readonly OpenkododMigrationManifest[],
  committedMigrations: readonly OpenkododMigrationRequestIdentity[],
  root: string
): void {
  pruneOpenkododMigrationStagingDirectories(root, stagedManifests)
  pruneOpenkododMigrationKeyedDirectories(join(root, RECEIVED_DIRECTORY), [
    ...stagedManifests,
    ...committedMigrations
  ])
}

function blobSetMismatch(descriptor: OpenkododMigrationBlobDescriptor): Error {
  return new Error(`openkodod_migration_blob_set_mismatch:${descriptor.blobKind}:${descriptor.key}`)
}

function receivedBlobIdentities(root: string, manifest: OpenkododMigrationManifest): string[] {
  const received = receivedBlobsDirectory(root, manifest)
  return OPENKODOD_MIGRATION_BLOB_KINDS.flatMap((blobKind) =>
    readDirectory(join(received, blobKind)).map((key) =>
      openkododMigrationBlobIdentity({ blobKind, key })
    )
  )
}

function stagedBlobDescriptors(
  root: string,
  manifest: OpenkododMigrationManifest
): OpenkododMigrationBlobDescriptor[] {
  const staging = openkododMigrationStagingDirectory(root, manifest)
  const descriptors: OpenkododMigrationBlobDescriptor[] = []
  for (const blobKind of OPENKODOD_MIGRATION_BLOB_KINDS) {
    for (const name of readDirectory(join(staging, blobKind))) {
      const match = STAGED_BLOB_NAME.exec(name)
      if (!match) {
        continue
      }
      try {
        descriptors.push(
          parseOpenkododMigrationBlobDescriptor({
            blobKind,
            key: match[1],
            sha256: match[2],
            byteLength: Number(match[3])
          })
        )
      } catch {
        // Foreign names cannot belong to the staged set.
      }
    }
  }
  return descriptors
}

function readDirectory(path: string): string[] {
  try {
    return readdirSync(path).sort()
  } catch {
    return []
  }
}

function inspectReceivedBlob(
  root: string,
  manifest: OpenkododMigrationManifest,
  descriptor: OpenkododMigrationBlobDescriptor
): 'absent' | 'matching' | 'conflict' {
  return inspectOpenkododMigrationFinalFile(
    getOpenkododMigrationReceivedBlobPath(root, manifest, descriptor),
    descriptor
  )
}

function receivedBlobsDirectory(root: string, manifest: OpenkododMigrationRequestIdentity): string {
  return join(root, RECEIVED_DIRECTORY, openkododMigrationStagingKey(manifest))
}

function stagedBlobPath(
  root: string,
  manifest: OpenkododMigrationManifest,
  descriptor: OpenkododMigrationBlobDescriptor
): string {
  return join(
    openkododMigrationStagingDirectory(root, manifest),
    descriptor.blobKind,
    `${descriptor.key}.${descriptor.sha256}.${descriptor.byteLength}.part`
  )
}
