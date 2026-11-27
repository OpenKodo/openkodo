/** Expose fenced-source checks/release through the cutover port; conversion owns terminal assessment, export and fence acquisition. */
import type { OpenkododMigrationSourceKind } from '../../../../shared/openkodod-migration/openkodod-migration-source-kind'
import type {
  OpenkododMigrationCatalogPayload,
  OpenkododMigrationManifest
} from '../../../../shared/openkodod-migration/openkodod-migration-manifest'
import type { OpenkododMigrationSourceCutover } from '../../../../shared/openkodod-migration/openkodod-migration-source-cutover'
import type {
  OpenkododMigrationExportedBlob,
  OpenkododMigrationManifestExportOptions
} from '../../../persistence/migrating-openkodod-catalog/source/catalog/openkodod-migration-manifest-export'
import type {
  OpenkododMigrationFenceResult,
  OpenkododMigrationFenceState
} from '../../../ssh/migration-source/openkodod-migration-source-fence'
import type { OpenkododMigrationTerminalVerdict } from '../../../ssh/migration-source/openkodod-migration-terminal-gate'

export type OpenkododMigrationSourceCutoverPort = {
  /** Before every stage and commit; throws unless the fenced source still matches the journal.
   * Returns the bytes of the blobs its manifest names, which that match proves are the journaled ones. */
  verifyFence: (cutover: OpenkododMigrationSourceCutover) => OpenkododMigrationExportedBlob[]
  /** Drops the fence, then the journal; only on proof the destination holds nothing. */
  releaseFence: (cutover: OpenkododMigrationSourceCutover) => Promise<void>
}

type OpenkododMigrationFenceAcquireArgs = {
  destinationEnvironmentId: string
  destinationName: string
  terminalProof: OpenkododMigrationTerminalVerdict
  now?: () => Date
  signal?: AbortSignal
}

export type OpenkododMigrationSource = OpenkododMigrationSourceCutoverPort & {
  readonly kind: OpenkododMigrationSourceKind
  readonly journalKey: string
  collectCatalog: () => OpenkododMigrationCatalogPayload
  /** Rewrite paths before signing; export must not mutate source. */
  exportManifest: (options?: OpenkododMigrationManifestExportOptions) => OpenkododMigrationManifest
  /** Before the fence. Loss of contact is `unverifiable`, never `exited`. */
  assessTerminals: () => Promise<OpenkododMigrationTerminalVerdict>
  retireProvenExitedTerminals: (proof: OpenkododMigrationTerminalVerdict) => void
  /** Throws when the journal cannot be read: an unreadable record keeps the source fenced. */
  resolveFence: () => OpenkododMigrationFenceState
  /** Journal, then fence, then flush, then the terminal re-check under the fence. */
  acquireFence: (args: OpenkododMigrationFenceAcquireArgs) => Promise<OpenkododMigrationFenceResult>
}
