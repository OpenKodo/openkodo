import type { OpenkododMigrationManifest } from '../../../../../shared/openkodod-migration/openkodod-migration-manifest'
import {
  OPENKODOD_MIGRATION_DEPENDENCY_KINDS,
  type OpenkododMigrationDependencyKind
} from '../../../../../shared/openkodod-migration/openkodod-migration-preflight'
import type { PersistedState } from '../../../../../shared/openkodo-profiles/persisted-state-types'
import type { TerminalScrollbackSnapshotStorage } from '../../../../pty/scrollback/terminal-scrollback-snapshots'
import {
  inspectOpenkododMigrationSourceSessions,
  type OpenkododMigrationSourceSessionInspection
} from './openkodod-source-session-dependencies'
import {
  collectOpenkododMigrationSourceDormantState,
  openkododMigrationLeavesBehind
} from '../dormancy/openkodod-source-dormant-state'
import {
  createOpenkododMigrationSourceScope,
  openkododMigrationOwnerMatchesScope,
  openkododMigrationPartitionScope,
  type OpenkododMigrationSourceScope
} from '../catalog/openkodod-source-scope'
import { paneBelongsToTabs } from '../../../../../shared/workspace-session/workspace-session-pane-ownership'

export type OpenkododMigrationSourceDependencyCensus = {
  totalCount: number
  counts: Record<OpenkododMigrationDependencyKind, number>
  /** Blocker names and remedies where available. */
  names?: Partial<Record<OpenkododMigrationDependencyKind, string[]>>
}

export function collectOpenkododMigrationUntransferredDependencyCensus(
  state: PersistedState,
  manifest: OpenkododMigrationManifest,
  storage?: TerminalScrollbackSnapshotStorage
): OpenkododMigrationSourceDependencyCensus {
  const scope = createOpenkododMigrationSourceScope({
    source: manifest.source,
    catalog: manifest.payload,
    repos: state.repos
  })
  const sessions = inspectOpenkododMigrationSourceSessions(state, {
    hostId: scope.hostId,
    ownerMatches: (ownerKey, partitionHostId) =>
      openkododMigrationOwnerMatchesScope(
        ownerKey,
        openkododMigrationPartitionScope(scope, partitionHostId)
      )
  })
  const dormant = collectOpenkododMigrationSourceDormantState(
    state,
    manifest.source,
    manifest.payload,
    storage,
    manifest.destinationEnvironmentId
  )
  const counts: Record<OpenkododMigrationDependencyKind, number> = {
    ...dormant.blockedCounts,
    'terminal-lease': state.sshRemotePtyLeases.filter(
      (lease) => lease.targetId === scope.targetId && lease.state !== 'terminated'
    ).length,
    // Retained recoveries can stay behind; the terminal gate still requires exit.
    'terminal-recovery': openkododMigrationLeavesBehind(state, scope.targetId)
      ? 0
      : countTerminalRecoveryState(state, scope, sessions)
  }
  return {
    counts,
    totalCount: OPENKODOD_MIGRATION_DEPENDENCY_KINDS.reduce(
      (total, kind) => total + counts[kind],
      0
    ),
    names: {
      ...(dormant.blockedSessionItems.length > 0
        ? { 'workspace-session': dormant.blockedSessionItems }
        : {}),
      ...(dormant.runningAutomationItems.length > 0
        ? { 'automation-run': dormant.runningAutomationItems }
        : {})
    }
  }
}

// The terminal gate proves recovery leases exited; hook aliases add no independent terminal ownership.
function countTerminalRecoveryState(
  state: PersistedState,
  scope: OpenkododMigrationSourceScope,
  sessions: OpenkododMigrationSourceSessionInspection
): number {
  return state.migrationUnsupportedPtyEntries.filter(
    (entry) =>
      openkododMigrationOwnerMatchesScope(entry.worktreeId, scope) ||
      (entry.tabId ? sessions.tabIds.has(entry.tabId) : false) ||
      sessions.ptyIds.has(entry.ptyId) ||
      (entry.paneKey ? paneBelongsToTabs(entry.paneKey, sessions.tabIds) : false)
  ).length
}
