// Export copies of relay-hosted SSH state without mutating source rows.
import {
  OPENKODOD_MIGRATION_SCROLLBACK_CHUNK_BYTES,
  type OpenkododMigrationTerminalScrollbackSnapshot
} from '../../../../../shared/openkodod-migration/openkodod-migration-scrollback'
import type {
  OpenkododMigrationCatalogPayload,
  OpenkododMigrationDormantStatePayload,
  OpenkododMigrationManifest,
  OpenkododMigrationManifestSource
} from '../../../../../shared/openkodod-migration/openkodod-migration-manifest'
import { assertOpenkododMigrationManifestDigest } from '../../../../openkodod/migration/openkodod-migration-manifest-digest'
import type { StoreRuntimeState } from '../../../loading-store/store-runtime-state'
import {
  collectOpenkododMigrationUntransferredDependencyCensus,
  type OpenkododMigrationSourceDependencyCensus
} from '../sessions/openkodod-source-dependency-census'
import {
  collectOpenkododMigrationSourceDormantState,
  type OpenkododMigrationSourceDormantInspection
} from '../dormancy/openkodod-source-dormant-state'
import { readOpenkododMigrationSourceScrollbackChunk } from '../scrollback/openkodod-source-scrollback-state'
import {
  createOpenkododMigrationDeltaView,
  type OpenkododMigrationDeltaView
} from './openkodod-source-delta-view'
import { syncOpenkododMigrationScrollbackRetention } from '../scrollback/openkodod-source-scrollback-retention'
import { createOpenkododMigrationLeaveBehindView } from './openkodod-source-leave-behind-view'
import {
  collectOpenkododMigrationSourceDrafts,
  type OpenkododMigrationSourceDrafts
} from '../worktrees/openkodod-source-draft-rename'

type OpenkododSourceExportRuntime = Pick<
  StoreRuntimeState,
  'state' | 'terminalScrollbackSnapshotStorage' | 'retainedScrollbackRefsByMigrationId'
>

const openkododSourceExportContext = Symbol('OpenkododSourceExportPersistence')

export class OpenkododSourceExportPersistence {
  readonly [openkododSourceExportContext]: OpenkododSourceExportRuntime

  constructor(runtime: OpenkododSourceExportRuntime) {
    this[openkododSourceExportContext] = runtime
  }

  collectOpenkododMigrationSourceDormantState(
    source: OpenkododMigrationManifestSource,
    catalog: OpenkododMigrationCatalogPayload,
    destinationEnvironmentId?: string
  ): OpenkododMigrationDormantStatePayload {
    const runtime = this[openkododSourceExportContext]
    return collectOpenkododMigrationSourceDormantState(
      runtime.state,
      source,
      catalog,
      runtime.terminalScrollbackSnapshotStorage,
      destinationEnvironmentId
    ).payload
  }

  /** The export plus what it could not carry, for a move that must refuse rather than drop rows. */
  inspectOpenkododMigrationSourceDormantState(
    source: OpenkododMigrationManifestSource,
    catalog: OpenkododMigrationCatalogPayload,
    destinationEnvironmentId?: string,
    daemonHistoryLeaf?: (tabId: string, leafId: string) => boolean
  ): OpenkododMigrationSourceDormantInspection {
    const runtime = this[openkododSourceExportContext]
    return collectOpenkododMigrationSourceDormantState(
      runtime.state,
      source,
      catalog,
      runtime.terminalScrollbackSnapshotStorage,
      destinationEnvironmentId,
      daemonHistoryLeaf
    )
  }

  collectOpenkododMigrationSourceDrafts(
    manifest: OpenkododMigrationManifest
  ): OpenkododMigrationSourceDrafts {
    return collectOpenkododMigrationSourceDrafts(this[openkododSourceExportContext].state, manifest)
  }

  createOpenkododMigrationDeltaView(
    moved: OpenkododMigrationManifest
  ): OpenkododMigrationDeltaView {
    return createOpenkododMigrationDeltaView(this[openkododSourceExportContext], moved)
  }

  /** Preview "Move anyway" without recording consent. */
  createOpenkododMigrationLeaveBehindView(targetId: string): OpenkododMigrationDeltaView {
    return createOpenkododMigrationLeaveBehindView(this[openkododSourceExportContext], targetId)
  }

  inspectOpenkododMigrationUntransferredDependencies(
    manifest: OpenkododMigrationManifest
  ): OpenkododMigrationSourceDependencyCensus {
    const runtime = this[openkododSourceExportContext]
    return collectOpenkododMigrationUntransferredDependencyCensus(
      runtime.state,
      manifest,
      runtime.terminalScrollbackSnapshotStorage
    )
  }

  /** Retain unfinished migrations' snapshots even if their tabs close. */
  syncOpenkododMigrationScrollbackRetention(pending: readonly OpenkododMigrationManifest[]): void {
    syncOpenkododMigrationScrollbackRetention(this[openkododSourceExportContext], pending)
  }

  /** Verify snapshot bytes against the signed manifest so changed buffers cannot be transferred. */
  readOpenkododMigrationSourceSnapshotChunk(
    manifest: OpenkododMigrationManifest,
    ref: string,
    offset: number
  ): { bytesBase64: string; totalBytes: number; eof: boolean } {
    assertOpenkododMigrationManifestDigest(manifest)
    const descriptor: OpenkododMigrationTerminalScrollbackSnapshot | undefined =
      manifest.payload.dormantState?.terminalScrollbackSnapshots?.find((entry) => entry.ref === ref)
    if (!descriptor) {
      throw new Error('openkodod_migration_source_snapshot_unknown')
    }
    const runtime = this[openkododSourceExportContext]
    return readOpenkododMigrationSourceScrollbackChunk({
      state: runtime.state,
      descriptor,
      retained: [...runtime.retainedScrollbackRefsByMigrationId.values()].some((refs) =>
        refs.has(ref)
      ),
      offset,
      length: OPENKODOD_MIGRATION_SCROLLBACK_CHUNK_BYTES,
      storage: runtime.terminalScrollbackSnapshotStorage
    })
  }
}
