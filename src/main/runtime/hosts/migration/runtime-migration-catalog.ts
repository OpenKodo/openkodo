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
  OpenkododMigrationBlobChunkResult,
  OpenkododMigrationBlobDescriptor
} from '../../../../shared/openkodod-migration/openkodod-migration-blob-transfer'
import {
  abortStagedOpenkododMigrationCatalogByReferenceDurably,
  abortStagedOpenkododMigrationCatalogDurably,
  commitStagedOpenkododMigrationCatalogDurably,
  getOpenkododMigrationCatalogState,
  stageOpenkododMigrationCatalogDurably
} from './openkodod-migration-catalog-import'
import { OpenKodoRuntimeWithResolveExitWaiters } from '../../terminal/wait/terminal-wait-settlements'
import type { RuntimeStore } from '../../construction/runtime-store-contract'

type MigrationStoreKey =
  | 'stageOpenkododMigrationCatalog'
  | 'commitStagedOpenkododMigrationCatalog'
  | 'stageOpenkododMigrationSnapshotChunk'
  | 'stageOpenkododMigrationBlobChunk'
  | 'abortStagedOpenkododMigrationCatalog'
  | 'abortStagedOpenkododMigrationCatalogByReference'
  | 'getOpenkododMigrationCatalogState'
  | 'flushPendingOrThrowAsync'

export abstract class OpenKodoRuntimeWithMigrationCatalog extends OpenKodoRuntimeWithResolveExitWaiters {
  async stageOpenkododMigrationCatalog(
    manifest: OpenkododMigrationManifest,
    options: { signal?: AbortSignal } = {}
  ): Promise<OpenkododMigrationCatalogState> {
    return stageOpenkododMigrationCatalogDurably({
      store: this.requireMigrationStore(
        'stageOpenkododMigrationCatalog',
        'flushPendingOrThrowAsync'
      ),
      manifest,
      signal: options.signal
    })
  }

  async commitStagedOpenkododMigrationCatalog(
    manifest: OpenkododMigrationManifest,
    options: {
      signal?: AbortSignal
      expectedBlobs?: readonly OpenkododMigrationBlobDescriptor[]
    } = {}
  ): Promise<OpenkododMigrationCatalogState> {
    return commitStagedOpenkododMigrationCatalogDurably({
      store: this.requireMigrationStore(
        'commitStagedOpenkododMigrationCatalog',
        'flushPendingOrThrowAsync'
      ),
      manifest,
      signal: options.signal,
      expectedBlobs: options.expectedBlobs,
      worktreeHasLiveShells: this.migrationWorktreeHasLiveShells,
      onDurableCommit: () => {
        this.invalidateResolvedWorktreeCache()
        this.notifyReposChanged()
      }
    })
  }

  stageOpenkododMigrationSnapshotChunk(
    request: OpenkododMigrationSnapshotChunkRequest
  ): OpenkododMigrationSnapshotChunkResult {
    // SAFETY: The virtual Store may differ from the checked Store; preserve its native failure.
    return this.requireMigrationStore('stageOpenkododMigrationSnapshotChunk')
      .stageOpenkododMigrationSnapshotChunk!(request)
  }

  stageOpenkododMigrationBlobChunk(
    request: OpenkododMigrationBlobChunkRequest
  ): OpenkododMigrationBlobChunkResult {
    // SAFETY: The virtual Store may differ from the checked Store; preserve its native failure.
    return this.requireMigrationStore('stageOpenkododMigrationBlobChunk')
      .stageOpenkododMigrationBlobChunk!(request)
  }

  async abortStagedOpenkododMigrationCatalog(
    manifest: OpenkododMigrationManifest,
    options: { signal?: AbortSignal } = {}
  ): Promise<OpenkododMigrationCatalogAbortResult> {
    return abortStagedOpenkododMigrationCatalogDurably({
      store: this.requireMigrationStore(
        'abortStagedOpenkododMigrationCatalog',
        'flushPendingOrThrowAsync'
      ),
      manifest,
      signal: options.signal
    })
  }

  async abortStagedOpenkododMigrationCatalogByReference(
    reference: OpenkododMigrationCatalogReference,
    options: { signal?: AbortSignal } = {}
  ): Promise<OpenkododMigrationCatalogReferenceAbortResult> {
    return abortStagedOpenkododMigrationCatalogByReferenceDurably({
      store: this.requireMigrationStore(
        'abortStagedOpenkododMigrationCatalogByReference',
        'flushPendingOrThrowAsync'
      ),
      reference,
      signal: options.signal
    })
  }

  getOpenkododMigrationCatalogState(
    manifest: OpenkododMigrationManifest
  ): OpenkododMigrationCatalogState {
    return getOpenkododMigrationCatalogState({
      store: this.requireMigrationStore('getOpenkododMigrationCatalogState'),
      manifest,
      worktreeHasLiveShells: this.migrationWorktreeHasLiveShells
    })
  }

  /** Install deferred migrated history after host-shell discovery; unanswered inventory retries on the next catalog query. */
  async installPendingOpenkododMigrationShellHistory(): Promise<void> {
    const store = this.store
    // Every daemon start calls this; no pending blobs must cost no inventory.
    if (
      !store?.installPendingOpenkododMigrationReceivedBlobs ||
      !store.hasPendingOpenkododMigrationShellHistory?.()
    ) {
      return
    }
    // Inventory first to find restart-surviving shells; real worktrees preserve their restored orchestration receipts.
    if (
      this.ptyController?.listProcesses &&
      !(await this.refreshPtyWorktreeRecordsWithControllerInventory([
        ...(await this.getResolvedWorktreeMap()).values()
      ]))
    ) {
      console.warn(
        '[openkodod-migration] shell history waits: the terminal inventory did not answer'
      )
      return
    }
    store.installPendingOpenkododMigrationReceivedBlobs({
      worktreeHasLiveShells: this.migrationWorktreeHasLiveShells
    })
  }

  override onPtyExit(
    ...args: Parameters<OpenKodoRuntimeWithResolveExitWaiters['onPtyExit']>
  ): ReturnType<OpenKodoRuntimeWithResolveExitWaiters['onPtyExit']> {
    const worktreeId = this.ptysById.get(args[0])?.worktreeId
    const result = super.onPtyExit(...args)
    if (worktreeId) {
      try {
        this.store?.installDeferredOpenkododMigrationShellHistory?.(worktreeId, {
          worktreeHasLiveShells: this.migrationWorktreeHasLiveShells
        })
      } catch (error) {
        console.error('[openkodod-migration] installing deferred shell history failed:', error)
      }
    }
    return result
  }

  // Migrated history belongs here; same-id SSH twins never write it.
  private readonly migrationWorktreeHasLiveShells = (worktreeId: string): boolean =>
    this.getLivePtyIdsForWorktree(worktreeId, undefined, { resolvedConnectionId: null }).size > 0

  // Check the captured Store, not a potentially different virtual return.
  private requireMigrationStore(...methods: MigrationStoreKey[]): RuntimeStore {
    const store = this.store
    if (!store || methods.some((method) => typeof store[method] !== 'function')) {
      throw new Error('runtime_unavailable')
    }
    return this.requireStore()
  }
}
