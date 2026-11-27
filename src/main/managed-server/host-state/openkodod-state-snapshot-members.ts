/** Only rollback-owned state: omit regenerable data and state owned by surviving processes. */
export const OPENKODOD_SNAPSHOT_MEMBERS = [
  'openkodo-profile-index.json',
  // Legacy layouts still supply migration input.
  'openkodo-data.json',
  'profiles',
  // Preserve cross-profile move recovery across server rollback.
  'profile-move-intents'
] as const

/** Live daemon ownership and regenerable logs must survive restore untouched. */
export const OPENKODOD_SNAPSHOT_EXCLUDED = ['daemon', 'logs'] as const

export const OPENKODOD_STATE_RESTORE_STAGE_DIRNAME = '.openkodod-state-restore-stage'

export const OPENKODOD_STATE_MUTATION_LOCK_DIRNAME = 'openkodod-state-mutation.lock'

/** Live mutations outlast stale windows; refresh their activation fence until owner exit. */
export const OPENKODOD_STATE_MUTATION_FENCE_HEARTBEAT_SECONDS = 60
/** Require several missed beats before reclaiming an exited desktop's lock. */
export const OPENKODOD_EXITED_OWN_LOCK_QUIET_SECONDS =
  3 * OPENKODOD_STATE_MUTATION_FENCE_HEARTBEAT_SECONDS

export const OPENKODOD_STATE_MUTATION_BUSY = 'STATE_MUTATION_BUSY'
export const OPENKODOD_STATE_MUTATION_DEADLINE = 'STATE_MUTATION_DEADLINE'

/** Windows uses a directory snapshot instead of POSIX state.tar. */
export const OPENKODOD_WINDOWS_SNAPSHOT_STATE_DIRNAME = 'state'

export const OPENKODOD_SNAPSHOT_FAILURE = 'SNAPSHOT_FAILURE'
