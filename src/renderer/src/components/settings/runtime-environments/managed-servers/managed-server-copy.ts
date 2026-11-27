import type {
  OpenkododManagedPendingMigrationRow,
  OpenkododManagedRuntimeStatus
} from '../../../../../../shared/remote-runtime/openkodod-lifecycle/openkodod-managed-runtime'
import type { OpenkododMigrationBlocker } from '../../../../../../shared/openkodod-migration/openkodod-migration-preflight'
import { translate } from '@/i18n/i18n'
import type { Translate } from '@/i18n/use-translate'
import { OPENKODOD_UPDATE_WSL_MOVE_RUNNING_CODE } from '../../../../../../shared/remote-runtime/wsl-hosts/wsl-host-types'
import { dependencyKindLabel } from './managed-server-dependency-kinds'

export function migrationPhaseLabel(
  phase: OpenkododManagedPendingMigrationRow['phase'],
  t: Translate = translate
): string {
  switch (phase) {
    case 'source-fenced':
      return t('auto.components.settings.managedServers.phase.fenced', 'Host locked')
    case 'destination-staged':
      return t('auto.components.settings.managedServers.phase.staged', 'Copy staged')
    case 'destination-committed':
      return t('auto.components.settings.managedServers.phase.committed', 'Copy committed')
    case 'source-retired':
      return t('auto.components.settings.managedServers.phase.retired', 'Finished')
  }
}

export function recoveryLabel(
  recovery: NonNullable<OpenkododManagedRuntimeStatus['recovery']>,
  t: Translate = translate
): string {
  switch (recovery.operation) {
    case 'activate':
      return t(
        'auto.components.settings.managedServers.recovery.activate',
        'An update was interrupted'
      )
    case 'rollback':
      return t(
        'auto.components.settings.managedServers.recovery.rollback',
        'A rollback was interrupted'
      )
    case 'decommission':
      return t(
        'auto.components.settings.managedServers.recovery.decommission',
        'A stop was interrupted'
      )
  }
}

/** `null` counts are unknown, never zero: the server did not answer. */
export function terminalCensusLabel(
  terminals: OpenkododManagedRuntimeStatus['terminals'],
  t: Translate = translate
): string {
  if (terminals.liveSessions === null) {
    return t(
      'auto.components.settings.managedServers.terminals.unknown',
      'Running terminals: unknown'
    )
  }
  return t(
    'auto.components.settings.managedServers.terminals.count',
    'Running terminals: {{count}}',
    { count: terminals.liveSessions }
  )
}

/** Copy for Update anyway; it states only what the forced update was verified to keep. */
export function forceUpdateMessage(t: Translate = translate, uncounted = false): string {
  if (uncounted) {
    return uncountedForceUpdateMessage(t)
  }
  return t(
    'auto.components.settings.managedServers.row.forceUpdate',
    'Terminals are running on this host. They keep running through the update, and their panes reconnect when OpenKodo’s server restarts.'
  )
}

/** Copy for forcing past a terminal count nobody answered: in-process terminals end with the restart. */
export function uncountedForceUpdateMessage(t: Translate = translate): string {
  return t(
    'auto.components.settings.managedServers.row.forceUpdateUncounted',
    'OpenKodo couldn’t count the terminals on this host. The update goes ahead only if no terminal daemon is running there, and any terminals OpenKodo’s server runs itself will end.'
  )
}

export function conversionBlockerLabel(blocker: OpenkododMigrationBlocker): string {
  switch (blocker.code) {
    case 'openkodod_migration_target_not_found':
      return translate(
        'auto.components.settings.managedServers.blocker.notFound',
        'The SSH host is gone.'
      )
    case 'openkodod_migration_target_owned':
    case 'openkodod_migration_owner_unrecorded':
      return translate(
        'auto.components.settings.managedServers.blocker.owned',
        'OpenKodo already runs on this SSH host.'
      )
    case 'openkodod_migration_direct_ssh_repositories':
    case 'openkodod_migration_direct_ssh_folder_workspaces':
      return translate(
        'auto.components.settings.managedServers.blocker.catalog',
        'Projects on this host cannot move yet.'
      )
    case 'openkodod_migration_direct_ssh_terminal_leases':
      return translate(
        'auto.components.settings.managedServers.blocker.terminals',
        'Terminals on this host are still running ({{count}}). Close them first.',
        { count: blocker.terminalLeases.length }
      )
    case 'openkodod_migration_saved_port_forwards':
      return translate(
        'auto.components.settings.managedServers.blocker.portForwards',
        'Saved port forwards stay with the SSH host.'
      )
    case 'openkodod_migration_dependent_state':
      return translate(
        'auto.components.settings.managedServers.blocker.dependents',
        'State that cannot move yet: {{kinds}}.',
        {
          kinds: blocker.dependencies
            .map((dependency) => `${dependencyKindLabel(dependency.kind)} (${dependency.count})`)
            .join(', ')
        }
      )
    case 'openkodod_migration_dependency_unverifiable':
      return translate(
        'auto.components.settings.managedServers.blocker.unverifiable',
        'OpenKodo could not read its saved {{sources}}, so it cannot tell what would move.',
        { sources: blocker.sources.map(dependencyKindLabel).join(', ') }
      )
  }
}

// Main's refusal codes, grouped by what the user does next; its English `reason` never reaches UI.
const LIVE_TERMINAL_CODES = new Set([
  'openkodod_initial_runtime_live',
  'openkodod_update_strands_live_terminals',
  'openkodod_update_terminals_running',
  'openkodod_update_ends_in_process_terminals',
  'openkodod_rollback_orphans_live_terminals',
  'openkodod_rollback_strands_live_terminals',
  'openkodod_recovery_orphans_live_terminals',
  'openkodod_stop_still_running'
])
const UNVERIFIABLE_CODES = new Set([
  'openkodod_initial_runtime_unverifiable',
  'openkodod_update_terminal_census_unavailable',
  'openkodod_update_daemon_protocol_unverifiable',
  'openkodod_rollback_active_identity_unverifiable',
  'openkodod_rollback_census_unavailable',
  'openkodod_rollback_daemon_protocol_unverifiable',
  'openkodod_rollback_snapshot_unverifiable',
  'openkodod_recovery_census_required',
  'openkodod_recovery_unverifiable',
  'openkodod_stop_cancel_unverifiable'
])
const MIGRATION_CODES = new Set([
  'openkodod_rollback_migration_in_progress',
  'openkodod_rollback_crosses_migration'
])

export function managedServerOutcomeLabel(
  result: {
    outcome: string
    code?: string
    verdict?: string
  },
  t: Translate = translate
): string {
  const code = result.code ?? ''
  if (code === 'openkodod_stop_active_environment') {
    return t(
      'auto.components.settings.managedServers.outcome.defaultServer',
      'Not done: this server is the default host for new projects. Choose another one under New projects open on before stopping it.'
    )
  }
  if (result.verdict === 'live' || LIVE_TERMINAL_CODES.has(code)) {
    return t(
      'auto.components.settings.managedServers.outcome.live',
      'Not done: terminals on this server are still running. Close them and try again.'
    )
  }
  if (result.verdict === 'unverifiable' || UNVERIFIABLE_CODES.has(code)) {
    return t(
      'auto.components.settings.managedServers.outcome.unverifiable',
      'Not done: OpenKodo couldn’t confirm what is running on this server. Try again when the host is reachable.'
    )
  }
  if (code === OPENKODOD_UPDATE_WSL_MOVE_RUNNING_CODE) {
    return t(
      'auto.components.settings.managedServers.outcome.wslMoveRunning',
      'Not done: a project is moving onto this server. OpenKodo updates it once the move finishes.'
    )
  }
  if (MIGRATION_CODES.has(code)) {
    return t(
      'auto.components.settings.managedServers.outcome.migration',
      'Not done: a move onto this server is unfinished. Resume it first.'
    )
  }
  if (result.outcome === 'deferred' || result.outcome === 'pending') {
    return t(
      'auto.components.settings.managedServers.outcome.deferred',
      'Not done yet: the server isn’t ready for this. Try again later.'
    )
  }
  return t(
    'auto.components.settings.managedServers.outcome.failed',
    'OpenKodo couldn’t finish this on the server. Try again.'
  )
}
