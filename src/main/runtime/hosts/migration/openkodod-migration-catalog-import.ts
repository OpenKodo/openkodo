import type {
  OpenkododMigrationCatalogAbortResult,
  OpenkododMigrationCatalogReference,
  OpenkododMigrationCatalogReferenceAbortResult,
  OpenkododMigrationCatalogState,
  OpenkododMigrationManifest
} from '../../../../shared/openkodod-migration/openkodod-migration-manifest'
import type { OpenkododMigrationBlobDescriptor } from '../../../../shared/openkodod-migration/openkodod-migration-blob-transfer'
import type { Store } from '../../../persistence/loading-store/store'

/** A moved history waits while a shell runs in its worktree: that shell would overwrite it. */
type WorktreeHasLiveShells = (worktreeId: string) => boolean

type OpenkododMigrationCatalogFlushStore = Partial<Pick<Store, 'flushPendingOrThrowAsync'>>
type OpenkododMigrationCatalogStageStore = OpenkododMigrationCatalogFlushStore &
  Partial<Pick<Store, 'stageOpenkododMigrationCatalog'>>
type OpenkododMigrationCatalogCommitStore = OpenkododMigrationCatalogFlushStore &
  Partial<
    Pick<Store, 'commitStagedOpenkododMigrationCatalog' | 'installOpenkododMigrationReceivedBlobs'>
  >
type OpenkododMigrationCatalogAbortStore = OpenkododMigrationCatalogFlushStore &
  Partial<Pick<Store, 'abortStagedOpenkododMigrationCatalog'>>
type OpenkododMigrationCatalogAbortByReferenceStore = OpenkododMigrationCatalogFlushStore &
  Partial<Pick<Store, 'abortStagedOpenkododMigrationCatalogByReference'>>

export async function stageOpenkododMigrationCatalogDurably(args: {
  store: OpenkododMigrationCatalogStageStore
  manifest: OpenkododMigrationManifest
  signal?: AbortSignal
}): Promise<OpenkododMigrationCatalogState> {
  // SAFETY: Returned or mutable Store slots retain their original native missing-method failure.
  const result = args.store.stageOpenkododMigrationCatalog!(args.manifest)
  await flushMigrationState(args.store, args.signal)
  return result
}

export async function commitStagedOpenkododMigrationCatalogDurably(args: {
  store: OpenkododMigrationCatalogCommitStore
  manifest: OpenkododMigrationManifest
  signal?: AbortSignal
  expectedBlobs?: readonly OpenkododMigrationBlobDescriptor[]
  onDurableCommit: () => void
  worktreeHasLiveShells?: WorktreeHasLiveShells
}): Promise<OpenkododMigrationCatalogState> {
  // SAFETY: Returned or mutable Store slots retain their original native missing-method failure.
  const result = args.store.commitStagedOpenkododMigrationCatalog!(
    args.manifest,
    args.expectedBlobs ? { expectedBlobs: args.expectedBlobs } : {}
  )
  await flushMigrationState(args.store, args.signal)
  args.onDurableCommit()
  installReceivedBlobs(args.store, args.manifest, args.worktreeHasLiveShells)
  return result
}

/** After the durable commit, on its retries and state queries; the store load retries too. */
function installReceivedBlobs(
  store: Partial<Pick<Store, 'installOpenkododMigrationReceivedBlobs'>>,
  manifest: OpenkododMigrationManifest,
  worktreeHasLiveShells: WorktreeHasLiveShells | undefined
): void {
  try {
    store.installOpenkododMigrationReceivedBlobs?.(manifest, { worktreeHasLiveShells })
  } catch (error) {
    // The catalog is committed; a failed install keeps its blob for the next retry.
    console.error('[openkodod-migration] installing received blobs failed:', error)
  }
}

export async function abortStagedOpenkododMigrationCatalogDurably(args: {
  store: OpenkododMigrationCatalogAbortStore
  manifest: OpenkododMigrationManifest
  signal?: AbortSignal
}): Promise<OpenkododMigrationCatalogAbortResult> {
  // SAFETY: Returned or mutable Store slots retain their original native missing-method failure.
  const result = args.store.abortStagedOpenkododMigrationCatalog!(args.manifest)
  // An already-absent retry may follow an in-memory abort whose flush failed.
  if (result.state === 'absent') {
    await flushMigrationState(args.store, args.signal)
    return { ...result, durableAbsent: true }
  }
  return result
}

export async function abortStagedOpenkododMigrationCatalogByReferenceDurably(args: {
  store: OpenkododMigrationCatalogAbortByReferenceStore
  reference: OpenkododMigrationCatalogReference
  signal?: AbortSignal
}): Promise<OpenkododMigrationCatalogReferenceAbortResult> {
  // SAFETY: Returned or mutable Store slots retain their original native missing-method failure.
  const result = args.store.abortStagedOpenkododMigrationCatalogByReference!(args.reference)
  await flushMigrationState(args.store, args.signal)
  // Either answer is flushed first, so a source that cannot re-send the manifest may act on it.
  return result.state === 'absent'
    ? { ...result, durableAbsent: true }
    : { ...result, durableCommitted: true }
}

export function getOpenkododMigrationCatalogState(args: {
  store: Partial<
    Pick<Store, 'getOpenkododMigrationCatalogState' | 'installOpenkododMigrationReceivedBlobs'>
  >
  manifest: OpenkododMigrationManifest
  worktreeHasLiveShells?: WorktreeHasLiveShells
}): OpenkododMigrationCatalogState {
  // SAFETY: Returned or mutable Store slots retain their original native missing-method failure.
  const result = args.store.getOpenkododMigrationCatalogState!(args.manifest)
  if (result.state === 'committed') {
    installReceivedBlobs(args.store, args.manifest, args.worktreeHasLiveShells)
  }
  return result
}

function flushMigrationState(
  store: OpenkododMigrationCatalogFlushStore,
  signal?: AbortSignal
): Promise<void> {
  // SAFETY: Returned or mutable Store slots retain their original native missing-method failure.
  return store.flushPendingOrThrowAsync!({
    signal,
    drainToStableGeneration: false
  })
}
