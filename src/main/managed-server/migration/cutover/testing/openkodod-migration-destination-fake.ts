import { vi, type Mock } from 'vitest'
import type {
  OpenkododMigrationCatalogState,
  OpenkododMigrationManifest
} from '../../../../../shared/openkodod-migration/openkodod-migration-manifest'
import { parseOpenkododMigrationManifest } from '../../../../../shared/openkodod-migration/openkodod-migration-manifest-validation'
import { advertisedOpenkododMigrationDestinationCapabilities } from '../../../../openkodod/migration/openkodod-migration-destination-capabilities'
import { assertOpenkododMigrationManifestDigest } from '../../../../openkodod/migration/openkodod-migration-manifest-digest'
import type { Store } from '../../../../persistence/loading-store/store'
import type { OpenkododMigrationDestinationCatalog } from '../openkodod-migration-cutover-coordinator'

type Catalog = OpenkododMigrationDestinationCatalog

export type FakeOpenkododMigrationDestination = { commits: number } & {
  [Method in keyof Catalog]: Mock<Catalog[Method]>
}

/** Model idempotent stage and receipt-keyed commit with separate catalog state for each migration, including later deltas. */
export function fakeOpenkododMigrationDestination(): FakeOpenkododMigrationDestination {
  const states = new Map<string, 'absent' | 'staged' | 'committed'>()
  const stateOf = (manifest: Pick<OpenkododMigrationManifest, 'migrationId'>) =>
    states.get(manifest.migrationId) ?? 'absent'
  const view = (manifest: OpenkododMigrationManifest): OpenkododMigrationCatalogState => {
    const state = stateOf(manifest)
    const base = { migrationId: manifest.migrationId, manifestSha256: manifest.manifestSha256 }
    if (state === 'committed') {
      return {
        ...base,
        state,
        receipt: {
          version: 1,
          migrationId: manifest.migrationId,
          manifestSha256: manifest.manifestSha256,
          source: manifest.source,
          importedAt: '2026-10-01T00:00:00.000Z',
          repositoryIds: [],
          projectGroupIds: [],
          folderWorkspaceIds: []
        }
      }
    }
    return state === 'staged'
      ? { ...base, state, stagedAt: '2026-10-01T00:00:00.000Z', snapshotUploads: [] }
      : { ...base, state }
  }
  const destination: FakeOpenkododMigrationDestination = {
    commits: 0,
    readState: vi.fn<Catalog['readState']>(async (manifest: OpenkododMigrationManifest) =>
      view(manifest)
    ),
    stage: vi.fn<Catalog['stage']>(async (manifest: OpenkododMigrationManifest) => {
      if (stateOf(manifest) === 'absent') {
        states.set(manifest.migrationId, 'staged')
      }
      return view(manifest)
    }),
    commit: vi.fn<Catalog['commit']>(async (manifest: OpenkododMigrationManifest) => {
      if (stateOf(manifest) === 'staged') {
        states.set(manifest.migrationId, 'committed')
        destination.commits += 1
      }
      return view(manifest)
    }),
    abort: vi.fn<Catalog['abort']>(async (manifest: OpenkododMigrationManifest) => {
      const aborted = stateOf(manifest) === 'staged'
      if (aborted) {
        states.set(manifest.migrationId, 'absent')
      }
      return { ...view(manifest), aborted, ...(aborted ? {} : { durableAbsent: true as const }) }
    }),
    abortByReference: vi.fn<Catalog['abortByReference']>(async (manifest) => {
      const identity = {
        migrationId: manifest.migrationId,
        manifestSha256: manifest.manifestSha256
      }
      if (stateOf(manifest) === 'committed') {
        return { ...identity, state: 'committed', aborted: false }
      }
      const aborted = stateOf(manifest) === 'staged'
      states.delete(manifest.migrationId)
      return { ...identity, state: 'absent', aborted, durableAbsent: true }
    }),
    stageChunk: vi.fn<Catalog['stageChunk']>(),
    readCapabilities: vi.fn<Catalog['readCapabilities']>(async () => []),
    stageBlobChunk: vi.fn<Catalog['stageBlobChunk']>()
  }
  return destination
}

/** A host server's real import, behind manifests sent as the RPC handler receives them. */
export function storeBackedOpenkododMigrationDestination(server: Store): Catalog {
  const sent = (manifest: OpenkododMigrationManifest): OpenkododMigrationManifest => {
    const raw = JSON.parse(JSON.stringify(manifest))
    assertOpenkododMigrationManifestDigest(raw)
    return parseOpenkododMigrationManifest(raw)
  }
  return {
    readState: async (manifest) => server.getOpenkododMigrationCatalogState(sent(manifest)),
    stage: async (manifest) => server.stageOpenkododMigrationCatalog(sent(manifest)),
    commit: async (manifest) => server.commitStagedOpenkododMigrationCatalog(sent(manifest)),
    abort: async (manifest) => {
      const result = server.abortStagedOpenkododMigrationCatalog(sent(manifest))
      return result.aborted ? result : { ...result, durableAbsent: true as const }
    },
    abortByReference: async (reference) =>
      server.abortStagedOpenkododMigrationCatalogByReference(reference),
    stageChunk: async (request) => server.stageOpenkododMigrationSnapshotChunk(request),
    readCapabilities: async () => advertisedOpenkododMigrationDestinationCapabilities(),
    stageBlobChunk: async (request) => server.stageOpenkododMigrationBlobChunk(request)
  }
}
