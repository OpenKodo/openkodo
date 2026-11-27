import { MAX_OPENKODOD_MIGRATION_STAGED_CATALOGS } from '../../../shared/openkodod-migration/openkodod-migration-staged-catalog-validation'
import { OPENKODOD_CATALOG_COMMIT_DOMAINS } from './catalog-commit/openkodod-catalog-commit-domains'
import { OPENKODOD_MIGRATION_MANIFEST_VERSION } from '../../../shared/openkodod-migration/openkodod-migration-manifest-validation'
import type {
  OpenkododMigrationCatalogAbortResult,
  OpenkododMigrationCatalogReference,
  OpenkododMigrationCatalogReferenceAbortResult,
  OpenkododMigrationCatalogState,
  OpenkododMigrationImportReceipt,
  OpenkododMigrationManifest
} from '../../../shared/openkodod-migration/openkodod-migration-manifest'
import type {
  OpenkododMigrationSnapshotChunkRequest,
  OpenkododMigrationSnapshotChunkResult
} from '../../../shared/openkodod-migration/openkodod-migration-scrollback'
import type {
  OpenkododMigrationBlobChunkRequest,
  OpenkododMigrationBlobChunkResult,
  OpenkododMigrationBlobDescriptor
} from '../../../shared/openkodod-migration/openkodod-migration-blob-transfer'
import type { RepoLifecycleOperations } from '../loading-store/project-catalog/repo-lifecycle-operations'
import type { StoreRuntimeState } from '../loading-store/store-runtime-state'

import { scheduleSave } from '../loading-store/profile-writing/write-scheduling'
import type { WriteSchedulingOperations } from '../loading-store/profile-writing/write-scheduling'
import {
  applyPreparedOpenkododMigrationCatalog,
  assertOpenkododMigrationReceiptMatchesManifest,
  assertSameOpenkododMigrationManifest,
  prepareOpenkododMigrationCatalog,
  type PreparedOpenkododMigrationCatalog
} from './catalog-commit/openkodod-catalog-records'
import {
  expireOpenkododMigrationStages,
  findOpenkododMigrationImportReceipt,
  isLiveOpenkododMigrationStage,
  recordOpenkododMigrationCommitWriteGeneration,
  recordOpenkododMigrationImportReceipt,
  type OpenkododMigrationCommitGenerationRuntime
} from './catalog-commit/openkodod-catalog-receipt-ledger'
import {
  abortOpenkododMigrationSnapshots,
  assertOpenkododMigrationSnapshotsReady,
  commitOpenkododMigrationSnapshots,
  inspectOpenkododMigrationSnapshotUploads,
  pruneOpenkododMigrationSnapshotStaging,
  stageOpenkododMigrationSnapshotChunk
} from './terminal-history/openkodod-scrollback-snapshot-transfer'
import {
  abortOpenkododMigrationBlobs,
  assertOpenkododMigrationBlobSetMatches,
  assertOpenkododMigrationBlobsReady,
  commitOpenkododMigrationBlobs,
  inspectOpenkododMigrationBlobUploads,
  pruneOpenkododMigrationBlobStaging,
  stageOpenkododMigrationBlobChunk
} from './blob-transfer/openkodod-migration-blob-staging'
import { withStagedAutomationRunHistory } from './catalog-commit/openkodod-staged-automation-run-history'
import { assertOpenkododMigrationBlobContentsValid } from './blob-transfer/openkodod-migration-blob-installers'
import {
  abortOpenkododMigrationCatalogByReference,
  committedMigrations,
  stagedManifests
} from './catalog-commit/openkodod-catalog-reference-abort'

type OpenkododCatalogImportRuntime = OpenkododMigrationCommitGenerationRuntime &
  Pick<
    StoreRuntimeState,
    'state' | 'terminalScrollbackSnapshotStorage' | 'openkododMigrationBlobRoot'
  >

const openkododCatalogImportContext = Symbol('OpenkododCatalogImportPersistence')
type OpenkododCatalogImportContext = {
  runtime: OpenkododCatalogImportRuntime
  repos: RepoLifecycleOperations
  scheduling: WriteSchedulingOperations
}

// Manifests arrive parsed; the RPC boundary verified the digest over the bytes as sent.

export class OpenkododCatalogImportPersistence {
  readonly [openkododCatalogImportContext]: OpenkododCatalogImportContext

  constructor(
    runtime: OpenkododCatalogImportRuntime,
    repos: RepoLifecycleOperations,
    scheduling: WriteSchedulingOperations
  ) {
    this[openkododCatalogImportContext] = { runtime, repos, scheduling }
  }

  stageOpenkododMigrationCatalog(
    manifest: OpenkododMigrationManifest,
    options: { now?: () => Date } = {}
  ): OpenkododMigrationCatalogState {
    const context = this[openkododCatalogImportContext]
    const now = options.now ?? (() => new Date())
    if (expireOpenkododMigrationStages(context.runtime.state, now().getTime())) {
      scheduleSave(context.scheduling, ['openkododMigrationStagedCatalogs'])
    }
    pruneOpenkododMigrationSnapshotStaging(
      stagedManifests(context.runtime.state),
      context.runtime.terminalScrollbackSnapshotStorage
    )
    pruneOpenkododMigrationBlobStaging(
      stagedManifests(context.runtime.state),
      committedMigrations(context.runtime.state),
      context.runtime.openkododMigrationBlobRoot
    )
    const current = migrationCatalogState(context.runtime, manifest)
    if (current.state === 'committed') {
      return current
    }
    prepareOpenkododMigrationCatalog(manifest, context.runtime.state)
    if (current.state === 'staged') {
      return current
    }
    const staged = context.runtime.state.openkododMigrationStagedCatalogs ?? []
    if (staged.length >= MAX_OPENKODOD_MIGRATION_STAGED_CATALOGS) {
      throw new Error('openkodod_migration_staging_capacity_exceeded')
    }
    const stagedAt = now().toISOString()
    context.runtime.state.openkododMigrationStagedCatalogs = [
      ...staged,
      {
        version: OPENKODOD_MIGRATION_MANIFEST_VERSION,
        manifest: structuredClone(manifest),
        stagedAt
      }
    ]
    scheduleSave(context.scheduling, ['openkododMigrationStagedCatalogs'])
    return stagedCatalogState(manifest, stagedAt, context.runtime)
  }

  stageOpenkododMigrationSnapshotChunk(
    request: OpenkododMigrationSnapshotChunkRequest
  ): OpenkododMigrationSnapshotChunkResult {
    const context = this[openkododCatalogImportContext]
    return stageOpenkododMigrationSnapshotChunk({
      stagedManifest:
        stagedManifests(context.runtime.state).find(
          (manifest) => manifest.migrationId === request.migrationId
        ) ?? null,
      storage: context.runtime.terminalScrollbackSnapshotStorage,
      request
    })
  }

  stageOpenkododMigrationBlobChunk(
    request: OpenkododMigrationBlobChunkRequest
  ): OpenkododMigrationBlobChunkResult {
    const context = this[openkododCatalogImportContext]
    return stageOpenkododMigrationBlobChunk({
      stagedManifest:
        stagedManifests(context.runtime.state).find(
          (manifest) => manifest.migrationId === request.migrationId
        ) ?? null,
      root: context.runtime.openkododMigrationBlobRoot,
      request
    })
  }

  /** Omitted expectedBlobs preserves older senders' commit behavior. */
  commitStagedOpenkododMigrationCatalog(
    manifest: OpenkododMigrationManifest,
    options: { now?: () => Date; expectedBlobs?: readonly OpenkododMigrationBlobDescriptor[] } = {}
  ): OpenkododMigrationCatalogState {
    const context = this[openkododCatalogImportContext]
    const current = migrationCatalogState(context.runtime, manifest)
    if (current.state === 'committed') {
      return current
    }
    if (current.state !== 'staged') {
      throw new Error('openkodod_migration_catalog_not_staged')
    }
    const blobRoot = context.runtime.openkododMigrationBlobRoot
    assertOpenkododMigrationSnapshotsReady(
      manifest,
      context.runtime.terminalScrollbackSnapshotStorage
    )
    if (options.expectedBlobs) {
      assertOpenkododMigrationBlobSetMatches(manifest, blobRoot, options.expectedBlobs)
    }
    assertOpenkododMigrationBlobsReady(manifest, blobRoot)
    assertOpenkododMigrationBlobContentsValid(manifest, blobRoot)
    const prepared = prepareOpenkododMigrationCatalog(
      withStagedAutomationRunHistory(manifest, blobRoot),
      context.runtime.state
    )
    commitOpenkododMigrationSnapshots(manifest, context.runtime.terminalScrollbackSnapshotStorage)
    commitOpenkododMigrationBlobs(manifest, blobRoot)
    const receipt = commitPreparedCatalog(context, manifest, prepared, options.now)
    const generationBefore = context.runtime.writeGeneration
    scheduleSave(context.scheduling, OPENKODOD_CATALOG_COMMIT_DOMAINS)
    recordOpenkododMigrationCommitWriteGeneration(context.runtime, manifest, generationBefore)
    return committedCatalogState(receipt)
  }

  abortStagedOpenkododMigrationCatalog(
    manifest: OpenkododMigrationManifest
  ): OpenkododMigrationCatalogAbortResult {
    const context = this[openkododCatalogImportContext]
    const current = migrationCatalogState(context.runtime, manifest)
    if (current.state === 'committed' || current.state === 'absent') {
      return { ...current, aborted: false }
    }
    // Staged rows are dormant and unreferenced outside this stage.
    context.runtime.state.openkododMigrationStagedCatalogs = (
      context.runtime.state.openkododMigrationStagedCatalogs ?? []
    ).filter((entry) => entry.manifest.migrationId !== manifest.migrationId)
    abortOpenkododMigrationSnapshots(manifest, context.runtime.terminalScrollbackSnapshotStorage)
    abortOpenkododMigrationBlobs(manifest, context.runtime.openkododMigrationBlobRoot)
    scheduleSave(context.scheduling, ['openkododMigrationStagedCatalogs'])
    return { ...absentCatalogState(manifest), aborted: true }
  }

  /** Use the stored manifest when the source cannot send one. */
  abortStagedOpenkododMigrationCatalogByReference(
    reference: OpenkododMigrationCatalogReference
  ): OpenkododMigrationCatalogReferenceAbortResult {
    return abortOpenkododMigrationCatalogByReference(
      this[openkododCatalogImportContext].runtime.state,
      reference,
      (manifest) => this.abortStagedOpenkododMigrationCatalog(manifest)
    )
  }

  getOpenkododMigrationCatalogState(
    manifest: OpenkododMigrationManifest
  ): OpenkododMigrationCatalogState {
    const context = this[openkododCatalogImportContext]
    return migrationCatalogState(context.runtime, manifest)
  }

  hasStagedOpenkododMigrationCatalog(now: number = Date.now()): boolean {
    return (
      this[openkododCatalogImportContext].runtime.state.openkododMigrationStagedCatalogs ?? []
    ).some((entry) => isLiveOpenkododMigrationStage(entry.stagedAt, now))
  }
}

function commitPreparedCatalog(
  context: OpenkododCatalogImportContext,
  manifest: OpenkododMigrationManifest,
  prepared: PreparedOpenkododMigrationCatalog,
  now?: () => Date
): OpenkododMigrationImportReceipt {
  applyPreparedOpenkododMigrationCatalog(prepared, context.runtime.state, context.repos)
  const receipt: OpenkododMigrationImportReceipt = {
    version: OPENKODOD_MIGRATION_MANIFEST_VERSION,
    migrationId: manifest.migrationId,
    manifestSha256: manifest.manifestSha256,
    source: structuredClone(manifest.source),
    importedAt: (now ?? (() => new Date()))().toISOString(),
    repositoryIds: prepared.repositories.map((repo) => repo.id),
    projectGroupIds: prepared.projectGroups.map((group) => group.id),
    folderWorkspaceIds: prepared.folderWorkspaces.map((workspace) => workspace.id)
  }
  context.runtime.state.openkododMigrationStagedCatalogs = (
    context.runtime.state.openkododMigrationStagedCatalogs ?? []
  ).filter((entry) => entry.manifest.migrationId !== manifest.migrationId)
  recordOpenkododMigrationImportReceipt(context.runtime.state, receipt)
  return receipt
}

function migrationCatalogState(
  runtime: OpenkododCatalogImportRuntime,
  manifest: OpenkododMigrationManifest
): OpenkododMigrationCatalogState {
  const { state } = runtime
  const receipt = findOpenkododMigrationImportReceipt(state, manifest)
  if (receipt) {
    assertCommittedReceipt(receipt, manifest)
    return committedCatalogState(receipt)
  }
  const staged = state.openkododMigrationStagedCatalogs?.find(
    (entry) => entry.manifest.migrationId === manifest.migrationId
  )
  if (!staged) {
    return absentCatalogState(manifest)
  }
  assertSameOpenkododMigrationManifest(staged.manifest, manifest)
  return stagedCatalogState(manifest, staged.stagedAt, runtime)
}

// A committed receipt stays authoritative even after live rows and snapshots change.
function assertCommittedReceipt(
  receipt: OpenkododMigrationImportReceipt,
  manifest: OpenkododMigrationManifest
): void {
  if (receipt.manifestSha256 !== manifest.manifestSha256) {
    throw new Error('openkodod_migration_id_reused_with_different_manifest')
  }
  assertOpenkododMigrationReceiptMatchesManifest(receipt, manifest)
}

function absentCatalogState(manifest: OpenkododMigrationManifest): OpenkododMigrationCatalogState {
  return {
    state: 'absent',
    migrationId: manifest.migrationId,
    manifestSha256: manifest.manifestSha256
  }
}

function stagedCatalogState(
  manifest: OpenkododMigrationManifest,
  stagedAt: string,
  runtime: OpenkododCatalogImportRuntime
): OpenkododMigrationCatalogState {
  const snapshotUploads = inspectOpenkododMigrationSnapshotUploads(
    manifest,
    runtime.terminalScrollbackSnapshotStorage
  )
  // Omit absent uploads to preserve older hosts' response shape.
  const blobUploads = inspectOpenkododMigrationBlobUploads(
    manifest,
    runtime.openkododMigrationBlobRoot
  )
  return {
    state: 'staged',
    migrationId: manifest.migrationId,
    manifestSha256: manifest.manifestSha256,
    stagedAt,
    ...(snapshotUploads ? { snapshotUploads } : {}),
    ...(blobUploads ? { blobUploads } : {})
  }
}

function committedCatalogState(
  receipt: OpenkododMigrationImportReceipt
): OpenkododMigrationCatalogState {
  return {
    state: 'committed',
    migrationId: receipt.migrationId,
    manifestSha256: receipt.manifestSha256,
    receipt: structuredClone(receipt)
  }
}
