/** Subtract earlier migrations' currently retained rows/state; export only additions. Never merge overlapping old source copies over server-owned state. */
import type {
  OpenkododDeltaMovePreview,
  OpenkododDeltaMoveRow
} from '../../../../shared/remote-runtime/openkodod-lifecycle/openkodod-managed-runtime'
import type {
  OpenkododMigrationCatalogPayload,
  OpenkododMigrationManifest
} from '../../../../shared/openkodod-migration/openkodod-migration-manifest'
import {
  isRetainedOpenkododMigrationSourceCutover,
  type OpenkododMigrationSourceCutover
} from '../../../../shared/openkodod-migration/openkodod-migration-source-cutover'

import type { SshTarget } from '../../../../shared/remote-runtime/ssh/ssh-types'
import type { Store } from '../../../persistence/loading-store/store'
import { collectOpenkododMigrationSourceCatalog } from '../../../persistence/migrating-openkodod-catalog/source/catalog/openkodod-source-catalog'
import { listOpenkododMigrationCutoverChainForTarget } from '../../../persistence/migrating-openkodod-catalog/cutover-journals/openkodod-migration-cutover-journal'
import {
  createOpenkododMigrationManifest,
  openkododMigrationCatalogIds,
  type OpenkododMigrationCatalogIds
} from '../../../persistence/migrating-openkodod-catalog/source/catalog/openkodod-migration-manifest-export'
import type { OpenkododMigrationSnapshotSource } from '../transfers/openkodod-migration-snapshot-coordinator'
import { collectUntransferredDependentBlockers } from '../../../ssh/targets/ssh-target-openkodod-dependents'
import type { OpenkododMigrationPreflightStore } from '../../../ssh/targets/ssh-target-openkodod-preflight'

export type OpenkododDeltaSourceStore = OpenkododMigrationPreflightStore &
  OpenkododMigrationSnapshotSource

export function unfinishedOpenkododDelta(
  chain: readonly OpenkododMigrationSourceCutover[]
): OpenkododMigrationSourceCutover | null {
  const head = chain.at(-1)
  return head?.supersedesMigrationId &&
    head.phase !== 'source-retired' &&
    !isRetainedOpenkododMigrationSourceCutover(head)
    ? head
    : null
}

export function committedOpenkododMigrationChain(
  chain: readonly OpenkododMigrationSourceCutover[]
): OpenkododMigrationSourceCutover[] {
  return (unfinishedOpenkododDelta(chain) ? chain.slice(0, -1) : chain).filter(
    (cutover) => cutover.phase === 'destination-committed' || cutover.phase === 'source-retired'
  )
}

export function openkododDeltaSourceStore(
  store: Store,
  target: SshTarget,
  moved: readonly OpenkododMigrationSourceCutover[],
  /** Older interrupted deltas may still include server-owned groups. */
  journaled?: OpenkododMigrationManifest
): OpenkododDeltaSourceStore {
  const ids = openkododMigrationCatalogIds(moved.map((cutover) => cutover.manifest.payload))
  // Never move projects/groups already owned through earlier links.
  const linked = moved.flatMap((cutover) => cutover.linkedRepositoryIds ?? [])
  const linkedGroups = moved.flatMap((cutover) => cutover.linkedProjectGroupIds ?? [])
  const linkedFolders = moved.flatMap((cutover) => cutover.linkedFolderWorkspaceIds ?? [])
  // New rows reference server-owned groups; exporting retained copies could overwrite newer server edits.
  const serverGroups = new Set([...ids.projectGroupIds, ...linkedGroups])
  const exported = new Set(journaled?.payload.projectGroups.map((group) => group.id))
  return openkododSourceStoreWithout(
    store,
    target,
    {
      ...ids,
      repositoryIds: new Set([...ids.repositoryIds, ...linked]),
      folderWorkspaceIds: new Set([...ids.folderWorkspaceIds, ...linkedFolders]),
      projectGroupIds: serverGroups
    },
    moved.at(-1)?.destinationEnvironmentId,
    new Set([...serverGroups].filter((id) => !exported.has(id)))
  )
}

export function openkododSourceStoreWithout(
  store: Store,
  target: SshTarget,
  owned: OpenkododMigrationCatalogIds,
  destinationEnvironmentId: string | undefined,
  /** Groups the server's record wins for: never exported, even while a moving row sits in one. */
  serverGroupIds: ReadonlySet<string> = new Set()
): OpenkododDeltaSourceStore {
  const ownedNow = createOpenkododMigrationManifest(store, target, {
    destinationEnvironmentId,
    onlyCatalog: owned
  })
  const view = store.createOpenkododMigrationDeltaView(ownedNow)
  return {
    ...view,
    serverOwnedProjectGroupIds: serverGroupIds,
    getSshTarget: (id) => store.getSshTarget(id),
    getSshRemotePtyLeases: (id) => store.getSshRemotePtyLeases(id),
    readOpenkododMigrationSourceSnapshotChunk: (...args) =>
      store.readOpenkododMigrationSourceSnapshotChunk(...args)
  }
}

export type OpenkododDeltaMovePlan = OpenkododDeltaMovePreview & {
  manifest: OpenkododMigrationManifest
  moved: OpenkododMigrationSourceCutover[]
  head: OpenkododMigrationSourceCutover
  resumes: OpenkododMigrationSourceCutover | null
  source: OpenkododDeltaSourceStore
}

export function planOpenkododDeltaMove(
  userDataPath: string,
  store: Store,
  target: SshTarget,
  options: { migrationId?: string; now?: () => Date } = {}
): OpenkododDeltaMovePlan {
  const environmentId = target.openkododFence?.environmentId
  if (!environmentId || !target.openkododFence?.sourceChangedAt) {
    throw new Error('openkodod_delta_not_changed')
  }
  const chain = listOpenkododMigrationCutoverChainForTarget(userDataPath, target.id)
  const resumes = unfinishedOpenkododDelta(chain)
  const moved = committedOpenkododMigrationChain(chain)
  const head = chain.at(resumes ? -2 : -1)
  if (
    !head ||
    !isRetainedOpenkododMigrationSourceCutover(head) ||
    moved.at(-1)?.migrationId !== head.migrationId
  ) {
    throw new Error('openkodod_delta_no_retained_migration')
  }
  const source = openkododDeltaSourceStore(store, target, moved, resumes?.manifest)
  const manifest =
    resumes?.manifest ??
    createOpenkododMigrationManifest(source, target, {
      migrationId: options.migrationId,
      now: options.now,
      destinationEnvironmentId: environmentId
    })
  const current = collectOpenkododMigrationSourceCatalog(store, target)
  return {
    sshTargetId: target.id,
    environmentId,
    added: catalogRows(manifest.payload),
    notReflected: notReflected(
      current,
      moved.map((cutover) => cutover.manifest.payload)
    ),
    blockers: collectUntransferredDependentBlockers(source, manifest),
    manifest,
    moved,
    head,
    resumes,
    source
  }
}

function catalogRows(catalog: OpenkododMigrationCatalogPayload): OpenkododDeltaMoveRow[] {
  return [
    ...catalog.repositories.map((row) => ({
      kind: 'repository' as const,
      id: row.id,
      label: row.displayName
    })),
    ...catalog.folderWorkspaces.map((row) => ({
      kind: 'folder-workspace' as const,
      id: row.id,
      label: row.name
    })),
    ...catalog.projectGroups.map((row) => ({
      kind: 'project-group' as const,
      id: row.id,
      label: row.name
    }))
  ]
}

/** Rows earlier migrations moved that an older build has since changed or removed. */
function notReflected(
  current: OpenkododMigrationCatalogPayload,
  movedPayloads: readonly OpenkododMigrationCatalogPayload[]
): OpenkododDeltaMovePreview['notReflected'] {
  const latestMoved = new Map<string, { row: OpenkododDeltaMoveRow; identity: string }>()
  for (const payload of movedPayloads) {
    for (const row of catalogRows(payload)) {
      latestMoved.set(`${row.kind}:${row.id}`, { row, identity: identityOf(payload, row) })
    }
  }
  const currentByKey = new Map(
    catalogRows(current).map((row) => [`${row.kind}:${row.id}`, identityOf(current, row)])
  )
  const edited: OpenkododDeltaMoveRow[] = []
  const removed: OpenkododDeltaMoveRow[] = []
  for (const [key, moved] of latestMoved) {
    const identity = currentByKey.get(key)
    if (identity === undefined) {
      removed.push(moved.row)
    } else if (identity !== moved.identity) {
      edited.push(moved.row)
    }
  }
  return { edited, removed }
}

function identityOf(catalog: OpenkododMigrationCatalogPayload, row: OpenkododDeltaMoveRow): string {
  switch (row.kind) {
    case 'repository': {
      const repo = catalog.repositories.find((entry) => entry.id === row.id)
      return `${repo?.path}\0${repo?.displayName}`
    }
    case 'folder-workspace': {
      const folder = catalog.folderWorkspaces.find((entry) => entry.id === row.id)
      return `${folder?.folderPath}\0${folder?.name}`
    }
    case 'project-group':
      return catalog.projectGroups.find((entry) => entry.id === row.id)?.name ?? ''
  }
}
