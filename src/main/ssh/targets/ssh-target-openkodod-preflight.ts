/** Read-only export preflight: catalog rows and representable dormant state can migrate; ownership, live leases and untransferred dependencies block. */
import { isLiveSshPtyLease } from '../../../shared/remote-runtime/ssh/ssh-types'
import type { Store } from '../../persistence/loading-store/store'
import type {
  OpenkododMigrationBlocker,
  OpenkododMigrationPreflight
} from '../../../shared/openkodod-migration/openkodod-migration-preflight'
import {
  createOpenkododMigrationManifest,
  type OpenkododMigrationExportStore
} from '../../persistence/migrating-openkodod-catalog/source/catalog/openkodod-migration-manifest-export'
import {
  collectTargetCatalogBlockers,
  resolveOpenkododPreflightTarget
} from './ssh-target-openkodod-claims'
import { collectUntransferredDependentBlockers } from './ssh-target-openkodod-dependents'
import {
  preservesOpenkododMigrationBridgedPanes,
  type OpenkododMigrationPaneLeasePredicate
} from '../migration-source/openkodod-migration-bridged-panes'

export type OpenkododMigrationPreflightStore = OpenkododMigrationExportStore &
  Pick<
    Store,
    'getSshTarget' | 'getSshRemotePtyLeases' | 'inspectOpenkododMigrationUntransferredDependencies'
  >

/** `owner` passes the environment's own fence only when its migration journal is on disk. */
export function preflightOpenkododMigrationExport(
  store: OpenkododMigrationPreflightStore,
  targetId: string,
  owner?: { environmentId: string; recorded: boolean },
  /** COMPAT(legacy-relay-bridge): leases a bridged proof left running for the bridge. */
  bridgedPtyIds: readonly string[] = []
): OpenkododMigrationPreflight {
  const resolved = resolveOpenkododPreflightTarget(store, targetId, owner)
  if ('result' in resolved) {
    return resolved.result
  }
  const { target } = resolved
  const blockers: OpenkododMigrationBlocker[] = [...collectTargetCatalogBlockers(store, target)]
  const terminalLeases = store
    .getSshRemotePtyLeases(targetId)
    .filter((lease) => isLiveSshPtyLease(lease) && !bridgedPtyIds.includes(lease.ptyId))
    .map(({ ptyId, worktreeId, tabId, leafId, state, updatedAt }) => ({
      ptyId,
      worktreeId,
      tabId,
      leafId,
      state,
      updatedAt
    }))
  if (terminalLeases.length > 0) {
    // A relay PTY cannot move to openkodod; its work must finish first.
    blockers.push({
      code: 'openkodod_migration_direct_ssh_terminal_leases',
      category: 'live-or-unverifiable',
      terminalLeases
    })
  }
  blockers.push(
    ...collectUntransferredDependentBlockers(store, createOpenkododMigrationManifest(store, target))
  )
  return {
    targetId,
    targetLabel: target.label,
    claimable: !blockers.some(isBlockingOpenkododMigrationBlocker),
    blockers
  }
}

/** Confirmed Move anyway can leave saved state, but desktop drafts that cannot be left still block. */
export function leaveBehindClearsOpenkododMigrationBlockers(
  store: OpenkododMigrationPreflightStore & Pick<Store, 'createOpenkododMigrationLeaveBehindView'>,
  targetId: string,
  bridgedPtyIds: readonly string[] = [],
  isBridgedPaneLease?: OpenkododMigrationPaneLeasePredicate
): boolean {
  const view = store.createOpenkododMigrationLeaveBehindView(targetId)
  const preflight = preflightOpenkododMigrationExport(
    {
      ...view,
      getSshTarget: (id) => store.getSshTarget(id),
      getSshRemotePtyLeases: (id) => store.getSshRemotePtyLeases(id)
    },
    targetId,
    undefined,
    bridgedPtyIds
  )
  const target = store.getSshTarget(targetId)
  return (
    preflight.claimable &&
    target !== undefined &&
    preservesOpenkododMigrationBridgedPanes(
      createOpenkododMigrationManifest(view, target).payload,
      store.getSshRemotePtyLeases(targetId),
      bridgedPtyIds,
      isBridgedPaneLease
    )
  )
}

/** Only saved state blocks: a confirmed "Move anyway" may leave it on this desktop. */
export function onlyLeavableOpenkododMigrationBlockers(
  blockers: readonly OpenkododMigrationBlocker[]
): boolean {
  const blocking = blockers.filter(isBlockingOpenkododMigrationBlocker)
  return (
    blocking.length > 0 &&
    blocking.every((blocker) => blocker.code === 'openkodod_migration_dependent_state')
  )
}

export function isBlockingOpenkododMigrationBlocker(blocker: OpenkododMigrationBlocker): boolean {
  return (
    blocker.category !== 'drainable-static-state' &&
    blocker.code !== 'openkodod_migration_saved_port_forwards'
  )
}
