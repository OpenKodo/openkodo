/** Keep source authority until durable destination commit. Verify the fenced export before stage/commit; resolve lost replies by catalog reads and persist journal transitions before returning. Never release a committed destination. */
import type {
  OpenkododMigrationCatalogAbortResult,
  OpenkododMigrationCatalogReference,
  OpenkododMigrationCatalogReferenceAbortResult,
  OpenkododMigrationCatalogState,
  OpenkododMigrationManifest
} from '../../../../shared/openkodod-migration/openkodod-migration-manifest'
import type {
  OpenkododMigrationSnapshotChunkRequest,
  OpenkododMigrationSnapshotChunkResult
} from '../../../../shared/openkodod-migration/openkodod-migration-scrollback'
import type {
  OpenkododMigrationBlobChunkRequest,
  OpenkododMigrationBlobChunkResult
} from '../../../../shared/openkodod-migration/openkodod-migration-blob-transfer'
import type {
  OpenkododMigrationSourceCutover,
  OpenkododMigrationSourceCutoverPhase
} from '../../../../shared/openkodod-migration/openkodod-migration-source-cutover'
import { resolveDurableOpenkododCatalogMutation } from './openkodod-catalog-durable-mutation'
import { OPENKODOD_MIGRATION_DESTINATION_UNSUPPORTED } from '../catalog/openkodod-migration-request'
import { openkododMigrationRequestFits } from '../catalog/openkodod-migration-request-budget'
import {
  listOpenkododMigrationSourceCutovers,
  writeOpenkododMigrationSourceCutover
} from '../../../persistence/migrating-openkodod-catalog/cutover-journals/openkodod-migration-cutover-journal'
import type { OpenkododMigrationSourceCutoverPort } from './openkodod-migration-source'
import {
  transferOpenkododMigrationSnapshots,
  type OpenkododMigrationSnapshotSource
} from '../transfers/openkodod-migration-snapshot-coordinator'
import {
  exportedOpenkododMigrationBlobSource,
  transferOpenkododMigrationBlobs
} from '../transfers/openkodod-migration-blob-coordinator'
import type { OpenkododMigrationExportedBlob } from '../../../persistence/migrating-openkodod-catalog/source/catalog/openkodod-migration-manifest-export'
import type { OpenkododMigrationPreflightStore } from '../../../ssh/targets/ssh-target-openkodod-preflight'
import { sshRelayMigrationCutoverPort } from '../../../ssh/migration-source/openkodod-migration-ssh-relay-source'
import type { SshTargetOpenkododClaims } from '../../../ssh/targets/ssh-target-openkodod-claims'

export type OpenkododMigrationDestinationCatalog = {
  readState: (manifest: OpenkododMigrationManifest) => Promise<OpenkododMigrationCatalogState>
  stage: (manifest: OpenkododMigrationManifest) => Promise<OpenkododMigrationCatalogState>
  commit: (manifest: OpenkododMigrationManifest) => Promise<OpenkododMigrationCatalogState>
  abort: (manifest: OpenkododMigrationManifest) => Promise<OpenkododMigrationCatalogAbortResult>
  /** Use identity-only abort when the journal's full manifest cannot fit a request. */
  abortByReference: (
    manifest: OpenkododMigrationCatalogReference
  ) => Promise<OpenkododMigrationCatalogReferenceAbortResult>
  stageChunk: (
    request: OpenkododMigrationSnapshotChunkRequest
  ) => Promise<OpenkododMigrationSnapshotChunkResult>
  /** Read fresh before blobs are sent: each blob kind needs its own capability. */
  readCapabilities: () => Promise<readonly string[]>
  stageBlobChunk: (
    request: OpenkododMigrationBlobChunkRequest
  ) => Promise<OpenkododMigrationBlobChunkResult>
}

export type OpenkododMigrationCutoverContext = {
  userDataPath: string
  store: OpenkododMigrationPreflightStore & OpenkododMigrationSnapshotSource
  claims: SshTargetOpenkododClaims
  destination: OpenkododMigrationDestinationCatalog
  /** Rebuild copied stores for each check so concurrent edits remain visible. */
  freshSource?: () => OpenkododMigrationPreflightStore
  /** The fenced source; defaults to the relay-era SSH target the journal names. */
  source?: OpenkododMigrationSourceCutoverPort
  now?: () => Date
}

function cutoverSource(
  context: OpenkododMigrationCutoverContext
): OpenkododMigrationSourceCutoverPort {
  return context.source ?? sshRelayMigrationCutoverPort(context)
}

export async function stageOpenkododMigrationDestination(
  context: OpenkododMigrationCutoverContext,
  migrationId: string
): Promise<OpenkododMigrationSourceCutover> {
  let cutover = requireCutover(context.userDataPath, migrationId)
  if (cutover.phase === 'destination-committed' || cutover.phase === 'source-retired') {
    return cutover
  }
  const blobs = assertSourceUnchanged(context, cutover)
  const { destination } = context
  const read = await destination.readState(cutover.manifest)
  const state =
    read.state === 'committed'
      ? await confirmDurableCommit(destination, cutover.manifest)
      : await resolveDurableOpenkododCatalogMutation(
          () => destination.stage(cutover.manifest),
          () => destination.readState(cutover.manifest),
          (observed) => observed.state !== 'absent'
        )
  cutover = recordObservedState(context, cutover, state)
  if (state.state === 'staged') {
    await transferOpenkododMigrationSnapshots({
      source: context.store,
      manifest: cutover.manifest,
      state,
      destination: { readState: destination.readState, stageChunk: destination.stageChunk }
    })
    await transferOpenkododMigrationBlobs({
      source: exportedOpenkododMigrationBlobSource(blobs),
      manifest: cutover.manifest,
      blobs: blobs.map((blob) => blob.descriptor),
      destination: {
        readCapabilities: destination.readCapabilities,
        readState: destination.readState,
        stageChunk: destination.stageBlobChunk
      }
    })
  }
  return cutover
}

export async function commitOpenkododMigrationDestination(
  context: OpenkododMigrationCutoverContext,
  migrationId: string
): Promise<OpenkododMigrationSourceCutover> {
  const staged = await stageOpenkododMigrationDestination(context, migrationId)
  if (staged.phase !== 'destination-staged') {
    return staged
  }
  assertSourceUnchanged(context, staged)
  const { destination } = context
  // A lost commit reply may hide success; catalog read decides the next step.
  const state = await resolveDurableOpenkododCatalogMutation(
    () => destination.commit(staged.manifest),
    () => destination.readState(staged.manifest),
    (observed) => observed.state === 'committed'
  )
  if (state.state !== 'committed') {
    throw new Error(`openkodod_migration_commit_not_committed:${state.state}`)
  }
  return recordObservedState(context, staged, state)
}

export type OpenkododMigrationAbortResult =
  | { outcome: 'released'; evidence: 'catalog-absent' | 'destination-unsupported' }
  | { outcome: 'refused'; code: string; reason: string }

/** Release only on proven destination absence; default drops journal/fence, while delta moves retain the fence. */
export async function abortOpenkododMigrationCutover(
  context: OpenkododMigrationCutoverContext,
  migrationId: string,
  release: (cutover: OpenkododMigrationSourceCutover) => Promise<void> = (cutover) =>
    cutoverSource(context).releaseFence(cutover)
): Promise<OpenkododMigrationAbortResult> {
  const cutover = requireCutover(context.userDataPath, migrationId)
  if (cutover.phase === 'destination-committed' || cutover.phase === 'source-retired') {
    return committedRefusal()
  }
  const { destination } = context
  // Older journals can hold oversized manifests; identity-only abort must still release them.
  if (!openkododMigrationRequestFits({ manifest: cutover.manifest })) {
    const aborted = await destination.abortByReference(cutover.manifest)
    if (aborted.state === 'committed') {
      return committedRefusal()
    }
    await release(cutover)
    return { outcome: 'released', evidence: 'catalog-absent' }
  }
  let state: OpenkododMigrationCatalogState
  try {
    state = await destination.readState(cutover.manifest)
  } catch (error) {
    // Unsupported proves absence only before any stage could have landed.
    if (isDestinationUnsupported(error) && cutover.phase === 'source-fenced') {
      await release(cutover)
      return { outcome: 'released', evidence: 'destination-unsupported' }
    }
    throw error
  }
  if (state.state !== 'committed') {
    state = await abortWithRecovery(destination, cutover.manifest)
  }
  if (state.state === 'committed') {
    recordObservedState(context, cutover, await confirmDurableCommit(destination, cutover.manifest))
    return committedRefusal()
  }
  if (state.state !== 'absent') {
    throw new Error(`openkodod_migration_abort_not_absent:${state.state}`)
  }
  await release(cutover)
  return { outcome: 'released', evidence: 'catalog-absent' }
}

/** Committed reads may be unflushed memory; require the idempotent commit acknowledgement to prove durability. */
export async function confirmDurableCommit(
  destination: OpenkododMigrationDestinationCatalog,
  manifest: OpenkododMigrationManifest
): Promise<OpenkododMigrationCatalogState> {
  const state = await destination.commit(manifest)
  if (state.state !== 'committed') {
    throw new Error(`openkodod_migration_commit_not_committed:${state.state}`)
  }
  return state
}

function assertSourceUnchanged(
  context: OpenkododMigrationCutoverContext,
  cutover: OpenkododMigrationSourceCutover
): OpenkododMigrationExportedBlob[] {
  return cutoverSource(context).verifyFence(cutover)
}

/** Persist observed state before returning. */
function recordObservedState(
  context: OpenkododMigrationCutoverContext,
  cutover: OpenkododMigrationSourceCutover,
  state: OpenkododMigrationCatalogState
): OpenkododMigrationSourceCutover {
  if (state.state === 'absent') {
    throw new Error('openkodod_migration_destination_catalog_absent')
  }
  if (
    state.migrationId !== cutover.migrationId ||
    state.manifestSha256 !== cutover.manifestSha256
  ) {
    throw new Error('openkodod_migration_destination_state_mismatch')
  }
  if (
    state.state === 'committed' &&
    (state.receipt.migrationId !== cutover.migrationId ||
      state.receipt.manifestSha256 !== cutover.manifestSha256)
  ) {
    throw new Error('openkodod_migration_destination_receipt_mismatch')
  }
  const phase: OpenkododMigrationSourceCutoverPhase =
    state.state === 'committed' ? 'destination-committed' : 'destination-staged'
  if (phase === cutover.phase) {
    return cutover
  }
  if (cutover.phase === 'destination-committed' || cutover.phase === 'source-retired') {
    // Never regress a proven commit.
    return cutover
  }
  const next: OpenkododMigrationSourceCutover = {
    ...cutover,
    phase,
    updatedAt: (context.now ?? (() => new Date()))().toISOString()
  }
  writeOpenkododMigrationSourceCutover(context.userDataPath, next)
  return next
}

/** Aborts staging; a failed abort is decided by a re-read, never assumed. */
export async function abortWithRecovery(
  destination: OpenkododMigrationDestinationCatalog,
  manifest: OpenkododMigrationManifest
): Promise<OpenkododMigrationCatalogState> {
  try {
    return await destination.abort(manifest)
  } catch (abortError) {
    try {
      const observed = await destination.readState(manifest)
      if (observed.state === 'committed') {
        return observed
      }
      if (observed.state === 'absent') {
        // Absent reads may predate flush; repeat abort to prove durable absence.
        return await destination.abort(manifest)
      }
    } catch {
      // Keep the original failure and fence while abort remains unverifiable.
    }
    throw abortError
  }
}

function requireCutover(
  userDataPath: string,
  migrationId: string
): OpenkododMigrationSourceCutover {
  const cutover = listOpenkododMigrationSourceCutovers(userDataPath).find(
    (entry) => entry.migrationId === migrationId
  )
  if (!cutover) {
    throw new Error('openkodod_migration_source_cutover_not_found')
  }
  return cutover
}

function committedRefusal(): OpenkododMigrationAbortResult {
  return {
    outcome: 'refused',
    code: 'openkodod_migration_committed_source_cannot_be_released',
    reason: 'This host’s OpenKodo server already holds this migration; it can only move forward.'
  }
}

function isDestinationUnsupported(error: unknown): boolean {
  return error instanceof Error && error.message === OPENKODOD_MIGRATION_DESTINATION_UNSUPPORTED
}
