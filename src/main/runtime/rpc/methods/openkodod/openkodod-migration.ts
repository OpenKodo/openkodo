import type { z } from 'zod'
import {
  OpenkododMigrationCatalogParams,
  OpenkododMigrationCatalogReferenceParams,
  OpenkododMigrationCommitCatalogParams
} from '../../../../../shared/rpc-contract/host-management/openkodod-migration-params'
import { parseOpenkododMigrationManifest } from '../../../../../shared/openkodod-migration/openkodod-migration-manifest-validation'
import { OpenkododMigrationSnapshotChunkRequestSchema } from '../../../../../shared/openkodod-migration/openkodod-migration-scrollback'
import { OpenkododMigrationBlobChunkRequestSchema } from '../../../../../shared/openkodod-migration/openkodod-migration-blob-transfer'
import { assertOpenkododMigrationManifestDigest } from '../../../../openkodod/migration/openkodod-migration-manifest-digest'
import { assertOpenkododMigrationSourceServedHere } from '../../../../openkodod/migration/openkodod-migration-wsl-destination'
import { defineMethod, type RpcContext } from '../../core'

export const OPENKODOD_MIGRATION_METHODS = [
  defineMethod({
    name: 'openkodod.migration.stageCatalog',
    permission: 'host-admin',
    params: OpenkododMigrationCatalogParams,
    handler: async (params, context) => {
      requireMigrationRuntimeClient(context)
      return context.runtime.stageOpenkododMigrationCatalog(migrationManifest(params), {
        signal: context.signal
      })
    }
  }),
  defineMethod({
    name: 'openkodod.migration.commitCatalog',
    permission: 'host-admin',
    params: OpenkododMigrationCommitCatalogParams,
    handler: async (params, context) => {
      requireMigrationRuntimeClient(context)
      return context.runtime.commitStagedOpenkododMigrationCatalog(migrationManifest(params), {
        signal: context.signal,
        ...(params.expectedBlobs ? { expectedBlobs: params.expectedBlobs } : {})
      })
    }
  }),
  defineMethod({
    name: 'openkodod.migration.stageSnapshotChunk',
    permission: 'host-admin',
    params: OpenkododMigrationSnapshotChunkRequestSchema,
    handler: async (params, context) => {
      requireMigrationRuntimeClient(context)
      return context.runtime.stageOpenkododMigrationSnapshotChunk(params)
    }
  }),
  // A separate method, not a field on stageSnapshotChunk: an older host would strip the field and
  // stage the bytes as a snapshot.
  defineMethod({
    name: 'openkodod.migration.stageBlobChunk',
    permission: 'host-admin',
    params: OpenkododMigrationBlobChunkRequestSchema,
    handler: async (params, context) => {
      requireMigrationRuntimeClient(context)
      return context.runtime.stageOpenkododMigrationBlobChunk(params)
    }
  }),
  defineMethod({
    name: 'openkodod.migration.abortCatalog',
    permission: 'host-admin',
    params: OpenkododMigrationCatalogParams,
    handler: async (params, context) => {
      requireMigrationRuntimeClient(context)
      return context.runtime.abortStagedOpenkododMigrationCatalog(migrationManifest(params), {
        signal: context.signal
      })
    }
  }),
  // Why a reference: a source fenced on a manifest no request can carry must still be releasable.
  defineMethod({
    name: 'openkodod.migration.abortCatalogByReference',
    permission: 'host-admin',
    params: OpenkododMigrationCatalogReferenceParams,
    handler: async (params, context) => {
      requireMigrationRuntimeClient(context)
      return context.runtime.abortStagedOpenkododMigrationCatalogByReference(params, {
        signal: context.signal
      })
    }
  }),
  defineMethod({
    name: 'openkodod.migration.catalogState',
    permission: 'host-admin',
    params: OpenkododMigrationCatalogParams,
    handler: async (params, context) => {
      requireMigrationRuntimeClient(context)
      return context.runtime.getOpenkododMigrationCatalogState(migrationManifest(params))
    }
  })
]

function migrationManifest(params: z.infer<typeof OpenkododMigrationCatalogParams>) {
  const manifest = parseOpenkododMigrationManifest(params.manifest)
  // Raw, not parsed: parsing drops fields this host predates, which a newer client signed.
  assertOpenkododMigrationManifestDigest(params.manifest)
  assertOpenkododMigrationSourceServedHere(manifest.source)
  return manifest
}

function requireMigrationRuntimeClient(context: RpcContext): void {
  if (context.clientKind !== 'runtime' || !context.pairedDeviceId) {
    throw new Error('openkodod_migration_runtime_client_required')
  }
}
