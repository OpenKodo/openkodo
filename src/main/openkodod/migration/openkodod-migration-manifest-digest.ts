import { createHash } from 'node:crypto'
import {
  openkododMigrationManifestHashInput,
  serializeOpenkododMigrationValue,
  type OpenkododMigrationManifest
} from '../../../shared/openkodod-migration/openkodod-migration-manifest'

export function computeOpenkododMigrationManifestSha256(
  manifest: Omit<OpenkododMigrationManifest, 'manifestSha256'>
): string {
  return createHash('sha256').update(openkododMigrationManifestHashInput(manifest)).digest('hex')
}

/** Hash the received manifest: unknown fields from newer peers are part of its signature. */
export function assertOpenkododMigrationManifestDigest(manifest: unknown): void {
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
    throw new Error('openkodod_migration_manifest_invalid')
  }
  const unsigned = Object.fromEntries(
    Object.entries(manifest).filter(([key]) => key !== 'manifestSha256')
  )
  const digest = createHash('sha256')
    .update(serializeOpenkododMigrationValue(unsigned))
    .digest('hex')
  if (!('manifestSha256' in manifest) || digest !== manifest.manifestSha256) {
    throw new Error('openkodod_migration_manifest_digest_mismatch')
  }
}
