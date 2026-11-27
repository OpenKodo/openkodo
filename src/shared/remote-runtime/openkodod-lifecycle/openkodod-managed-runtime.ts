import type { PublicKnownRuntimeEnvironment } from '../host-catalog/runtime-environments'
import type { OpenkododTerminalCensus } from './openkodod-terminal-census'
import type { OpenkododMigrationBlocker } from '../../openkodod-migration/openkodod-migration-preflight'
import type { OpenkododMigrationSourceCutoverPhase } from '../../openkodod-migration/openkodod-migration-source-cutover'
import type { OpenkododDaemonRetirementVerdict } from './openkodod-stop-request'
import type { SshManagedServerLinkedProject } from '../ssh/ssh-types'
import type { OpenkododStaleLockEvidence } from './openkodod-stale-lock-reclaim'

export const OPENKODOD_MANAGED_REMOTE_PORT = 6_768

/** Refused because terminals are, or may be, still running on the host. */
export type OpenkododManagedRefusal = {
  outcome: 'refused'
  verdict: 'live' | 'unverifiable'
  code: string
  reason: string
  /** Only saved state blocks, which a confirmed "Move anyway" leaves on this desktop. */
  canLeaveBehind?: true
}

export type OpenkododManagedDeferral = {
  outcome: 'deferred'
  candidateVersion: string
  code: string
  reason: string
  /** False when force cannot make the rejected lifecycle transition safe. */
  forceable?: boolean
}

/** The one deferral Update anyway may pass: counted terminals the daemon carries across. */
export const OPENKODOD_UPDATE_TERMINALS_RUNNING_CODE = 'openkodod_update_terminals_running'

/** Deferrals over a census no daemon answered; force passes them only once the candidate proves no daemon is running. */
const OPENKODOD_UPDATE_UNCOUNTED_TERMINALS_CODES: ReadonlySet<string> = new Set([
  'openkodod_update_terminal_census_unavailable',
  'openkodod_update_daemon_protocol_unverifiable'
])

/** Forcing these may end terminals the server runs itself, so the user confirms that first. */
export function isOpenkododUncountedTerminalsDeferral(code: string): boolean {
  return OPENKODOD_UPDATE_UNCOUNTED_TERMINALS_CODES.has(code)
}

/** Update anyway passes counted live-terminal deferrals, preserves version admission, and requires the confirmed incumbent build. */
export type OpenkododManagedPastLiveTerminals = {
  incumbentVersion: string | null
  /** The terminal count was unknown; the user accepted that terminals the server runs itself end. */
  uncounted?: true
}

export type OpenkododManagedDeployResult =
  | {
      outcome: 'created' | 'updated' | 'already-current'
      environment: PublicKnownRuntimeEnvironment
      activeVersion: string
    }
  | OpenkododManagedDeferral

export type OpenkododManagedRollbackResult =
  | {
      outcome: 'rolled-back'
      environment: PublicKnownRuntimeEnvironment
      activeVersion: string
      discarded: string[]
    }
  | { outcome: 'refused' | 'failed'; code: string; reason: string }

/** A recovery that needs the operator to accept restoring a snapshot over changed state. */
export const OPENKODOD_RECOVERY_CHANGED_STATE_CODE = 'openkodod_recovery_changed_state'

export type OpenkododManagedRecoveryResult =
  | { outcome: 'none' }
  | { outcome: 'pending'; code: string; reason: string }
  | {
      outcome: 'recovered'
      resolution: 'committed' | 'restored-incumbent'
      activeVersion: string | null
      environment: PublicKnownRuntimeEnvironment
    }
  | OpenkododManagedRefusal

/** Only a proven `exited` unlinks the server locally; anything less keeps it linked. */
export type OpenkododManagedStopResult =
  | {
      outcome: 'unlinked'
      verdict: 'exited'
      environmentId: string
      sshTargetId: string
      stoppedVersion: string | null
      retirement: OpenkododDaemonRetirementVerdict | null
    }
  | OpenkododManagedRefusal

/** Refuse restart with live or unverifiable terminals: the daemon outlives openkodod and retains its inherited environment. */
export type OpenkododManagedRestartResult =
  | { outcome: 'restarted'; environmentId: string }
  | { outcome: 'terminals-running'; liveSessions: number | null }
  | { outcome: 'not-restarted'; reason: string }

/** A dry run, or a confirmation pinned to the lock record that dry run showed. */
export type OpenkododManagedStaleLockReclaimRequest =
  | { yes: false }
  | { yes: true; expectNonce: string }

/** `openkodod --reclaim-stale-lock` run on a managed host's active slot (#32177). */
export type OpenkododManagedStaleLockReclaimResult =
  | {
      status: 'none' | 'eligible' | 'refused'
      message: string
      lockPath: string
      evidence?: OpenkododStaleLockEvidence
    }
  /** `notRestarted` says why the server did not start again once its lock was cleared. */
  | {
      status: 'reclaimed'
      environmentId: string
      message: string
      lockPath: string
      /** The record the reclaim acted on. */
      evidence?: OpenkododStaleLockEvidence
      notRestarted?: string
    }
  /** No remote reclaim occurred. reclaimWithoutPin requires manual reclaim because the host cannot pin confirmation;
   * otherwise lockPath names the lock to delete manually. */
  | { status: 'unsupported'; message: string; lockPath?: string; reclaimWithoutPin?: true }
  /** The slot runs the command but gave no answer this client understands; nothing is known. */
  | { status: 'no-answer'; message: string }
  /** Another lifecycle step holds the host; nothing changed. */
  | { status: 'busy'; message: string }

/** Forget only unlinks this desktop; an unreachable server may still run, so its verdict remains unverifiable. */
export type OpenkododManagedForgetResult =
  | {
      outcome: 'forgotten'
      verdict: 'unverifiable'
      environmentId: string
      sshTargetId: string
    }
  | OpenkododManagedRefusal

export type OpenkododManagedCancelStopResult =
  | { outcome: 'none' }
  /** The stop was withdrawn before openkodod acted on it; the server keeps serving. */
  | { outcome: 'canceled'; activeVersion: string }
  /** openkodod had already exited; finish with stop to unlink the server. */
  | { outcome: 'already-stopped' }
  | OpenkododManagedRefusal

export type OpenkododManagedRuntimeStatus = {
  environmentId: string
  sshTargetId: string
  activeVersion: string | null
  previousVersion: string | null
  activatedAt: string | null
  rollbackAvailable: boolean
  recovery:
    | {
        operation: 'activate'
        phase: 'prepared' | 'incumbent-stopped' | 'snapshot-captured' | 'candidate-ready'
        version: string
        startedAt: string
      }
    | {
        operation: 'rollback'
        phase:
          | 'prepared'
          | 'incumbent-stopped'
          | 'rescue-captured'
          | 'rollback-state-restored'
          | 'target-ready'
        version: string
        startedAt: string
      }
    | {
        operation: 'decommission'
        phase: 'prepared' | 'stop-dispatched' | 'process-exited'
        version: string
        startedAt: string
      }
    | null
  /** Terminals the daemon runs; `null` counts are unverifiable and block updates and stops. */
  terminals: OpenkododTerminalCensus
  /** An unfinished dormant migration into this server; a rollback is refused while it runs. */
  migration: {
    migrationId: string
    phase: OpenkododMigrationSourceCutoverPhase
    startedAt: string
  } | null
  /** The last update this client deferred for this server, cleared once one goes through. */
  deferredUpdate: (OpenkododManagedDeferral & { deferredAt: string }) | null
  /** The OpenKodo release that activated `activeVersion`; absent when unknown or from older desktops. */
  activeAppVersion?: string | null
  /** This desktop's bundled build when Update would move the host to it; absent from older desktops. */
  availableUpdate?: string | null
}

export type OpenkododManagedConversionResult =
  | {
      /** Committed on the server and retired from the SSH host. */
      outcome: 'converted'
      environment: PublicKnownRuntimeEnvironment
      migrationId: string
      /** Projects the server already held, so this desktop's own state for them did not move. */
      linkedProjects?: SshManagedServerLinkedProject[]
      /** Moved automations the server would not re-enable; they stay off there. */
      automationsLeftDisabled?: number
    }
  | OpenkododManagedDeferral
  | OpenkododManagedRefusal

export type OpenkododManagedPendingMigrationRow = {
  migrationId: string
  environmentId: string
  name: string
  sshTargetId: string
  phase: OpenkododMigrationSourceCutoverPhase
  startedAt: string
}

export type OpenkododDeltaMoveRow = {
  kind: 'repository' | 'folder-workspace' | 'project-group'
  id: string
  label: string
}

/** What moving a host's newer projects would add, and what the server will keep as it is. */
export type OpenkododDeltaMovePreview = {
  sshTargetId: string
  environmentId: string
  added: OpenkododDeltaMoveRow[]
  /** Projects an older build changed or removed; the server keeps its own copy of these. */
  notReflected: { edited: OpenkododDeltaMoveRow[]; removed: OpenkododDeltaMoveRow[] }
  blockers: OpenkododMigrationBlocker[]
}

export type OpenkododDeltaMoveResult =
  | { outcome: 'moved'; migrationId: string }
  | { outcome: 'refused'; code: string; reason: string; blockers?: OpenkododMigrationBlocker[] }
