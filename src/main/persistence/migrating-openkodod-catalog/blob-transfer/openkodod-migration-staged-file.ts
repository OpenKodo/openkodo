// Fsync staged appends, verify retried ranges, and commit digest-checked files by hard link.
import { createHash } from 'node:crypto'
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  rmSync,
  statSync,
  writeSync
} from 'node:fs'
import { join } from 'node:path'
import type { OpenkododMigrationManifest } from '../../../../shared/openkodod-migration/openkodod-migration-manifest'
import { syncDirectoryDurablySync } from '../../../filesystem/durable-file-write'

export const OPENKODOD_MIGRATION_STAGING_DIRECTORY = '.openkodod-migration-staging'

/** Selects error codes such as openkodod_migration_<channel>_offset_invalid. */
export type OpenkododMigrationStagingChannel = 'snapshot' | 'blob'

export type OpenkododMigrationRequestIdentity = { migrationId: string; manifestSha256: string }

export type OpenkododMigrationStagedContent = { sha256: string; byteLength: number }

export type OpenkododMigrationStagedChunk = {
  channel: OpenkododMigrationStagingChannel
  path: string
  offset: number
  bytes: Buffer
  byteLength: number
}

/** Retried ranges must match; returns staged size. */
export function appendOpenkododMigrationStagedChunk(chunk: OpenkododMigrationStagedChunk): number {
  const { channel, path, offset, bytes } = chunk
  const descriptorFd = openStagedFile(path)
  try {
    const size = statSync(path).size
    if (offset > size || offset + bytes.length > chunk.byteLength) {
      throw new Error(`openkodod_migration_${channel}_offset_invalid`)
    }
    if (offset < size) {
      if (offset + bytes.length > size) {
        throw new Error(`openkodod_migration_${channel}_offset_invalid`)
      }
      const existing = Buffer.alloc(bytes.length)
      const read = readSync(descriptorFd, existing, 0, existing.length, offset)
      if (read !== bytes.length || !existing.equals(bytes)) {
        throw new Error(`openkodod_migration_${channel}_retry_mismatch`)
      }
      return size
    }
    const written = writeSync(descriptorFd, bytes, 0, bytes.length, offset)
    if (written !== bytes.length) {
      throw new Error(`openkodod_migration_${channel}_write_incomplete`)
    }
    fsyncSync(descriptorFd)
    return size + bytes.length
  } finally {
    closeSync(descriptorFd)
  }
}

export function openkododMigrationStagedFileSize(path: string, byteLength: number): number {
  try {
    return Math.min(statSync(path).size, byteLength)
  } catch {
    return 0
  }
}

export function openkododMigrationFileMatches(
  path: string,
  expected: OpenkododMigrationStagedContent
): boolean {
  try {
    const bytes = readFileSync(path)
    return (
      bytes.length === expected.byteLength &&
      createHash('sha256').update(bytes).digest('hex') === expected.sha256
    )
  } catch {
    return false
  }
}

export function inspectOpenkododMigrationFinalFile(
  path: string | null,
  expected: OpenkododMigrationStagedContent
): 'absent' | 'matching' | 'conflict' {
  if (!path || !existsSync(path)) {
    return 'absent'
  }
  return openkododMigrationFileMatches(path, expected) ? 'matching' : 'conflict'
}

/** An identical final file makes a retried hard-link commit succeed; different bytes refuse. */
export function linkOpenkododMigrationStagedFile(args: {
  stagedPath: string
  finalPath: string
  expected: OpenkododMigrationStagedContent
  conflictError: string
}): void {
  if (inspectOpenkododMigrationFinalFile(args.finalPath, args.expected) !== 'matching') {
    try {
      linkSync(args.stagedPath, args.finalPath)
    } catch (error) {
      const finalStatus = inspectOpenkododMigrationFinalFile(args.finalPath, args.expected)
      if (finalStatus === 'conflict') {
        throw new Error(args.conflictError)
      }
      if (finalStatus !== 'matching') {
        throw error
      }
    }
  }
  rmSync(args.stagedPath, { force: true })
}

export function openkododMigrationStagingDirectory(
  root: string,
  manifest: OpenkododMigrationManifest
): string {
  return join(root, OPENKODOD_MIGRATION_STAGING_DIRECTORY, openkododMigrationStagingKey(manifest))
}

export function ensureOpenkododMigrationDirectory(path: string): void {
  mkdirSync(path, { recursive: true, mode: 0o700 })
}

export function removeOpenkododMigrationStagingDirectory(
  root: string,
  manifest: OpenkododMigrationManifest
): void {
  rmSync(openkododMigrationStagingDirectory(root, manifest), { recursive: true, force: true })
  syncDirectoryDurablySync(join(root, OPENKODOD_MIGRATION_STAGING_DIRECTORY))
}

export function pruneOpenkododMigrationStagingDirectories(
  root: string,
  stagedManifests: readonly OpenkododMigrationManifest[]
): void {
  pruneOpenkododMigrationKeyedDirectories(
    join(root, OPENKODOD_MIGRATION_STAGING_DIRECTORY),
    stagedManifests
  )
}

export function pruneOpenkododMigrationKeyedDirectories(
  parent: string,
  retainedMigrations: readonly OpenkododMigrationRequestIdentity[]
): void {
  const retained = new Set(retainedMigrations.map(openkododMigrationStagingKey))
  let entries: string[]
  try {
    entries = readdirSync(parent)
  } catch {
    return
  }
  for (const entry of entries) {
    if (/^[a-f0-9]{32}$/.test(entry) && !retained.has(entry)) {
      rmSync(join(parent, entry), { recursive: true, force: true })
    }
  }
}

/** Refuse through the channel's error if its staged manifest does not match. */
export function requireStagedOpenkododMigrationManifest(
  staged: OpenkododMigrationManifest | null,
  request: OpenkododMigrationRequestIdentity,
  notStagedError: string
): OpenkododMigrationManifest {
  if (
    !staged ||
    staged.migrationId !== request.migrationId ||
    staged.manifestSha256 !== request.manifestSha256
  ) {
    throw new Error(notStagedError)
  }
  return staged
}

export function openkododMigrationStagingKey(manifest: OpenkododMigrationRequestIdentity): string {
  return createHash('sha256')
    .update(`${manifest.migrationId}\0${manifest.manifestSha256}`)
    .digest('hex')
    .slice(0, 32)
}

function openStagedFile(path: string): number {
  try {
    return openSync(path, 'r+')
  } catch {
    try {
      return openSync(path, 'wx+', 0o600)
    } catch {
      return openSync(path, 'r+')
    }
  }
}
