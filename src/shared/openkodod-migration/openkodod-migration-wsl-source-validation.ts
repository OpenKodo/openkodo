import type {
  OpenkododMigrationLocalWslManifestSource,
  OpenkododMigrationManifest
} from './openkodod-migration-manifest'
import {
  MAX_OPENKODOD_MIGRATION_FOLDER_WORKSPACES,
  MAX_OPENKODOD_MIGRATION_REPOSITORIES,
  boundedStringArray,
  requiredString
} from './openkodod-migration-manifest-fields'
import { isOpenkododMigrationLocalWslSource } from './openkodod-migration-source-kind'

export function parseLocalWslSource(
  value: Record<string, unknown>
): OpenkododMigrationLocalWslManifestSource {
  // A non-SSH source naming an SSH target could only be a confused or forged manifest.
  if (value.sshTargetId !== undefined) {
    throw new Error('openkodod_migration_manifest_source_invalid')
  }
  const generation = value.generation
  if (!Number.isSafeInteger(generation) || Number(generation) < 1) {
    throw new Error('openkodod_migration_manifest_source_generation_invalid')
  }
  return {
    kind: 'local-wsl',
    distro: requiredString(value.distro, 'source.distro'),
    ...(value.distroGuid === undefined
      ? {}
      : { distroGuid: requiredString(value.distroGuid, 'source.distroGuid') }),
    scopeRepoIds: boundedStringArray(
      value.scopeRepoIds,
      MAX_OPENKODOD_MIGRATION_REPOSITORIES,
      'source.scopeRepoIds_invalid'
    ),
    scopeFolderWorkspaceIds: boundedStringArray(
      value.scopeFolderWorkspaceIds,
      MAX_OPENKODOD_MIGRATION_FOLDER_WORKSPACES,
      'source.scopeFolderWorkspaceIds_invalid'
    ),
    generation: Number(generation)
  }
}

/** The catalog a WSL source moves is exactly its declared scope; the host never infers scope. */
export function assertLocalWslScopeMatchesPayload(manifest: OpenkododMigrationManifest): void {
  const { source, payload } = manifest
  if (!isOpenkododMigrationLocalWslSource(source)) {
    return
  }
  const sameIds = (declared: readonly string[], rows: readonly { id: string }[]): boolean => {
    const ids = new Set(rows.map((row) => row.id))
    // A doubled declared id would let one payload row through unscoped.
    return (
      new Set(declared).size === declared.length &&
      declared.length === ids.size &&
      declared.every((id) => ids.has(id))
    )
  }
  if (
    !sameIds(source.scopeRepoIds, payload.repositories) ||
    !sameIds(source.scopeFolderWorkspaceIds, payload.folderWorkspaces)
  ) {
    throw new Error('openkodod_migration_manifest_source_scope_mismatch')
  }
}
