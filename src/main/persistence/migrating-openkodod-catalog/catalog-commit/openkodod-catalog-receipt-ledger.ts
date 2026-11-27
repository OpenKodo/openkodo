// Commit receipts remain authoritative indefinitely; abandoned stages expire.
import { MAX_OPENKODOD_MIGRATION_IMPORT_RECEIPTS } from '../../../../shared/openkodod-migration/openkodod-migration-manifest-validation'
import type {
  OpenkododMigrationImportReceipt,
  OpenkododMigrationManifest
} from '../../../../shared/openkodod-migration/openkodod-migration-manifest'
import { MAX_OPENKODOD_MIGRATION_EVICTED_RECEIPTS } from '../../../../shared/openkodod-migration/openkodod-migration-evicted-receipts'
import type { PersistedState } from '../../../../shared/openkodo-profiles/persisted-state-types'
import type { StoreRuntimeState } from '../../loading-store/store-runtime-state'
import {
  openkododMigrationStagingKey,
  type OpenkododMigrationRequestIdentity
} from '../blob-transfer/openkodod-migration-staged-file'

// Allow a week for clients that went offline mid-move.
export const OPENKODOD_MIGRATION_STAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export function findOpenkododMigrationImportReceipt(
  state: PersistedState,
  manifest: OpenkododMigrationManifest
): OpenkododMigrationImportReceipt | undefined {
  const receipt = state.openkododMigrationImportReceipts?.find(
    (entry) => entry.migrationId === manifest.migrationId
  )
  if (receipt) {
    return receipt
  }
  const evicted = state.openkododMigrationEvictedReceipts?.find(
    (entry) => entry.migrationId === manifest.migrationId
  )
  // Rebuild the remaining receipt fields from the manifest.
  return evicted
    ? {
        version: manifest.version,
        migrationId: evicted.migrationId,
        manifestSha256: evicted.manifestSha256,
        source: structuredClone(manifest.source),
        importedAt: evicted.importedAt,
        repositoryIds: manifest.payload.repositories.map((repo) => repo.id),
        projectGroupIds: manifest.payload.projectGroups.map((group) => group.id),
        folderWorkspaceIds: manifest.payload.folderWorkspaces.map((workspace) => workspace.id)
      }
    : undefined
}

/** Compact evicted receipts without losing proof of commit. */
export function recordOpenkododMigrationImportReceipt(
  state: PersistedState,
  receipt: OpenkododMigrationImportReceipt
): void {
  const receipts = [...(state.openkododMigrationImportReceipts ?? []), receipt]
  const overflow = receipts.length - MAX_OPENKODOD_MIGRATION_IMPORT_RECEIPTS
  if (overflow > 0) {
    state.openkododMigrationEvictedReceipts = [
      ...(state.openkododMigrationEvictedReceipts ?? []),
      ...receipts.slice(0, overflow).map(({ migrationId, manifestSha256, importedAt }) => ({
        migrationId,
        manifestSha256,
        importedAt
      }))
    ].slice(-MAX_OPENKODOD_MIGRATION_EVICTED_RECEIPTS)
  }
  state.openkododMigrationImportReceipts = receipts.slice(-MAX_OPENKODOD_MIGRATION_IMPORT_RECEIPTS)
}

export function isLiveOpenkododMigrationStage(stagedAt: string, now: number): boolean {
  return now - Date.parse(stagedAt) < OPENKODOD_MIGRATION_STAGE_TTL_MS
}

export function expireOpenkododMigrationStages(state: PersistedState, now: number): boolean {
  const staged = state.openkododMigrationStagedCatalogs ?? []
  const live = staged.filter((entry) => isLiveOpenkododMigrationStage(entry.stagedAt, now))
  if (live.length === staged.length) {
    return false
  }
  state.openkododMigrationStagedCatalogs = live
  return true
}

export type OpenkododMigrationCommitGenerationRuntime = Pick<
  StoreRuntimeState,
  'writeGeneration' | 'lastDurableWriteGeneration' | 'openkododMigrationCommitWriteGenerations'
>

/** Call right after the commit's `scheduleSave`; `generationBefore` is read just before it. */
export function recordOpenkododMigrationCommitWriteGeneration(
  runtime: OpenkododMigrationCommitGenerationRuntime,
  migration: OpenkododMigrationRequestIdentity,
  generationBefore: number
): void {
  // Suppressed saves never advance generation; only a disk-loaded receipt can prove durability.
  runtime.openkododMigrationCommitWriteGenerations.set(
    openkododMigrationStagingKey(migration),
    runtime.writeGeneration > generationBefore ? runtime.writeGeneration : Number.POSITIVE_INFINITY
  )
}

/** Require disk durability before consuming blobs a restart might need to retry. */
export function isOpenkododMigrationCommitDurable(
  runtime: OpenkododMigrationCommitGenerationRuntime,
  migration: OpenkododMigrationRequestIdentity
): boolean {
  const key = openkododMigrationStagingKey(migration)
  const required = runtime.openkododMigrationCommitWriteGenerations.get(key)
  if (required === undefined) {
    return true
  }
  if (runtime.lastDurableWriteGeneration < required) {
    return false
  }
  runtime.openkododMigrationCommitWriteGenerations.delete(key)
  return true
}
