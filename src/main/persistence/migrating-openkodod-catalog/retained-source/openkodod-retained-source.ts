import { createHash } from 'node:crypto'
import type { OpenkododMigrationCatalogPayload } from '../../../../shared/openkodod-migration/openkodod-migration-manifest'
import {
  MAX_OPENKODOD_MIGRATION_FOLDER_WORKSPACES,
  MAX_OPENKODOD_MIGRATION_REPOSITORIES
} from '../../../../shared/openkodod-migration/openkodod-migration-manifest-fields'

import {
  isRetainedOpenkododMigrationSourceCutover,
  type OpenkododMigrationSourceCutover
} from '../../../../shared/openkodod-migration/openkodod-migration-source-cutover'

import { listEnvironments } from '../../../../shared/remote-runtime/host-store/runtime-environment-store'
import { getOpenkododSshDeployment } from '../../../../shared/remote-runtime/host-catalog/runtime-environments'
import type { SshTarget } from '../../../../shared/remote-runtime/ssh/ssh-types'
import type { Store } from '../../loading-store/store'
import { collectOpenkododMigrationSourceCatalog } from '../source/catalog/openkodod-source-catalog'
import {
  listOpenkododMigrationCutoverChainForTarget,
  writeOpenkododMigrationSourceCutover
} from '../cutover-journals/openkodod-migration-cutover-journal'

import { openkododMigrationCatalogIds } from '../source/catalog/openkodod-migration-manifest-export'
import type { CatalogStore } from '../source/catalog/openkodod-source-visibility'

type TargetStore = Pick<Store, 'getSshTargets' | 'updateSshTarget'>

/** Keep the identity-only fingerprint format stable for older builds; timestamps must not create source changes. */
export function openkododCatalogFingerprint(catalog: OpenkododMigrationCatalogPayload): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        catalog.repositories.map((repo) => `${repo.id}\0${repo.path}`).sort(),
        catalog.folderWorkspaces.map((folder) => `${folder.id}\0${folder.folderPath}`).sort(),
        catalog.projectGroups.map((group) => group.id).sort()
      ])
    )
    .digest('hex')
}

export function currentOpenkododSourceFingerprint(
  store: CatalogStore,
  target: Pick<SshTarget, 'id'>
): string {
  return openkododCatalogFingerprint(collectOpenkododMigrationSourceCatalog(store, target))
}

type UnmovedOpenkododSourceRows = { repositoryIds: string[]; folderWorkspaceIds: string[] }

/** Delta candidates exclude moved/linked/explicitly kept projects and folders. Group organization alone never represents new server work. */
export function unmovedOpenkododSourceRows(
  current: OpenkododMigrationCatalogPayload,
  chain: readonly OpenkododMigrationSourceCutover[]
): UnmovedOpenkododSourceRows {
  const moved = openkododMigrationCatalogIds(chain.map((cutover) => cutover.manifest.payload))
  const repositories = new Set([
    ...moved.repositoryIds,
    ...chain.flatMap((cutover) => [
      ...(cutover.linkedRepositoryIds ?? []),
      ...(cutover.keptRepositoryIds ?? [])
    ])
  ])
  const folders = new Set([
    ...moved.folderWorkspaceIds,
    ...chain.flatMap((cutover) => [
      ...(cutover.linkedFolderWorkspaceIds ?? []),
      ...(cutover.keptFolderWorkspaceIds ?? [])
    ])
  ])
  return {
    repositoryIds: current.repositories.map((row) => row.id).filter((id) => !repositories.has(id)),
    folderWorkspaceIds: current.folderWorkspaces
      .map((row) => row.id)
      .filter((id) => !folders.has(id))
  }
}

function retainedOpenkododSourceBaseline(head: OpenkododMigrationSourceCutover): string {
  return head.sourceBaselineFingerprint ?? openkododCatalogFingerprint(head.manifest.payload)
}

export function withKeptOpenkododSourceRows(
  head: OpenkododMigrationSourceCutover,
  unmoved: UnmovedOpenkododSourceRows
): OpenkododMigrationSourceCutover {
  const keptRepositoryIds = [...(head.keptRepositoryIds ?? []), ...unmoved.repositoryIds]
  const keptFolderWorkspaceIds = [
    ...(head.keptFolderWorkspaceIds ?? []),
    ...unmoved.folderWorkspaceIds
  ]
  // Beyond kept-row bounds, the baseline fingerprint still records explicit reconciliation.
  return keptRepositoryIds.length <= MAX_OPENKODOD_MIGRATION_REPOSITORIES &&
    keptFolderWorkspaceIds.length <= MAX_OPENKODOD_MIGRATION_FOLDER_WORKSPACES
    ? { ...head, keptRepositoryIds, keptFolderWorkspaceIds }
    : head
}

type RetainedSourceReview = {
  verdict: 'unchanged' | 'changed'
  unrecordedKeptRows: UnmovedOpenkododSourceRows | null
}

/** New rows mark changed only when baseline differs; older explicit-keeps lack row lists and rely on that baseline. */
function reviewRetainedOpenkododSource(
  store: CatalogStore,
  target: Pick<SshTarget, 'id'>,
  chain: readonly OpenkododMigrationSourceCutover[],
  head: OpenkododMigrationSourceCutover
): RetainedSourceReview {
  const current = collectOpenkododMigrationSourceCatalog(store, target)
  const unmoved = unmovedOpenkododSourceRows(current, chain)
  if (unmoved.repositoryIds.length === 0 && unmoved.folderWorkspaceIds.length === 0) {
    return { verdict: 'unchanged', unrecordedKeptRows: null }
  }
  if (openkododCatalogFingerprint(current) !== retainedOpenkododSourceBaseline(head)) {
    return { verdict: 'changed', unrecordedKeptRows: null }
  }
  return { verdict: 'unchanged', unrecordedKeptRows: unmoved }
}

/** At startup, restore generation-matched managed fences and detect retained-source additions. Failed reconciliation leaves state unchanged. */
export async function reconcileManagedOpenkododSshTargets(
  userDataPath: string,
  store: CatalogStore & TargetStore,
  now: () => Date = () => new Date()
): Promise<void> {
  try {
    await restoreFencesFromManagedServers(userDataPath, store)
    markChangedRetainedSources(userDataPath, store, now)
  } catch (error) {
    console.warn('[ssh] Could not reconcile managed OpenKodo server hosts:', error)
  }
}

async function restoreFencesFromManagedServers(
  userDataPath: string,
  store: TargetStore
): Promise<void> {
  const targets = new Map(store.getSshTargets().map((target) => [target.id, target]))
  for (const environment of await listEnvironments(userDataPath)) {
    const deployment = getOpenkododSshDeployment(environment)
    const target = deployment ? targets.get(deployment.sshTargetId) : undefined
    // Recreated ids identify new registrations; restore fences only for matching generation.
    if (target && !target.openkododFence && target.generation === deployment?.sshTargetGeneration) {
      store.updateSshTarget(target.id, { openkododFence: { environmentId: environment.id } })
    }
  }
}

function markChangedRetainedSources(
  userDataPath: string,
  store: CatalogStore & TargetStore,
  now: () => Date
): void {
  for (const target of store.getSshTargets()) {
    const fence = target.openkododFence
    const chain = fence ? listOpenkododMigrationCutoverChainForTarget(userDataPath, target.id) : []
    const head = chain.at(-1)
    if (!fence || !head || fence.environmentId !== head.destinationEnvironmentId) {
      continue
    }
    // Restore an interrupted delta's changed mark so reconnect resumes its journal.
    const interruptedDelta =
      head.supersedesMigrationId !== undefined &&
      (head.phase === 'source-fenced' || head.phase === 'destination-staged')
    const review =
      !interruptedDelta && isRetainedOpenkododMigrationSourceCutover(head)
        ? reviewRetainedOpenkododSource(store, target, chain, head)
        : null
    const kept = review?.unrecordedKeptRows
      ? withKeptOpenkododSourceRows(head, review.unrecordedKeptRows)
      : head
    if (kept !== head) {
      // Record kept rows once so later group edits cannot turn them into new additions.
      writeOpenkododMigrationSourceCutover(userDataPath, kept)
    }
    if (fence.sourceChangedAt) {
      // Clear older builds' marks for removals/group edits that delta migration cannot carry (#31523).
      if (review?.verdict === 'unchanged') {
        const { sourceChangedAt: _lifted, ...unmarked } = fence
        store.updateSshTarget(target.id, { openkododFence: unmarked })
      }
      continue
    }
    if (interruptedDelta || review?.verdict === 'changed') {
      store.updateSshTarget(target.id, {
        openkododFence: { ...fence, sourceChangedAt: now().toISOString() }
      })
    }
  }
}
