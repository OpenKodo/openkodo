/** Persist journals in owner-only profile sidecars: older profile schemas drop unknown fields but retain fences, so an in-profile journal could vanish on downgrade. Unreadable journals fail closed. */
import {
  MAX_OPENKODOD_MIGRATION_SOURCE_CUTOVERS,
  isRetainedOpenkododMigrationSourceCutover,
  parseOpenkododMigrationSourceCutover,
  type OpenkododMigrationSourceCutover
} from '../../../../shared/openkodod-migration/openkodod-migration-source-cutover'
import {
  createMigrationJournalDirectory,
  orderMigrationJournalChain
} from './migration-journal-directory'

class OpenkododMigrationCutoverJournalUnreadableError extends Error {
  constructor(detail: string) {
    super(`The migration journal cannot be read, so the SSH host stays fenced: ${detail}`)
    this.name = 'OpenkododMigrationCutoverJournalUnreadableError'
  }
}

type JournalChangeListener = (userDataPath: string) => void
let journalChangeListener: JournalChangeListener | null = null

export function setOpenkododMigrationJournalChangeListener(
  listener: JournalChangeListener | null
): void {
  journalChangeListener = listener
}

const journals = createMigrationJournalDirectory({
  directoryName: 'openkodod-migration-cutovers',
  // A manifest carries catalog rows and dormant session state, never scrollback bytes.
  maxFileBytes: 16 * 1024 * 1024,
  parse: parseOpenkododMigrationSourceCutover,
  unreadable: (detail) => new OpenkododMigrationCutoverJournalUnreadableError(detail),
  onChange: (userDataPath) => journalChangeListener?.(userDataPath)
})

export function openkododMigrationCutoverJournalDirectory(userDataPath: string): string {
  return journals.directory(userDataPath)
}

/** Never skip an unreadable or untrusted journal. */
export function listOpenkododMigrationSourceCutovers(
  userDataPath: string
): OpenkododMigrationSourceCutover[] {
  return journals.list(userDataPath)
}

export function findOpenkododMigrationSourceCutoverForTarget(
  userDataPath: string,
  sshTargetId: string
): OpenkododMigrationSourceCutover | null {
  const chain = listOpenkododMigrationCutoverChainForTarget(userDataPath, sshTargetId)
  return chain.at(-1) ?? null
}

/** Oldest first; throws unless the target's journals form one chain of delta moves. */
export function listOpenkododMigrationCutoverChainForTarget(
  userDataPath: string,
  sshTargetId: string
): OpenkododMigrationSourceCutover[] {
  const matches = listOpenkododMigrationSourceCutovers(userDataPath).filter(
    (cutover) => cutover.sshTargetId === sshTargetId
  )
  return orderMigrationJournalChain(
    matches,
    (detail) => new OpenkododMigrationCutoverJournalUnreadableError(detail),
    `SSH target ${sshTargetId}`
  )
}

/** Flush before returning so later fence writes always have a durable journal. */
export function writeOpenkododMigrationSourceCutover(
  userDataPath: string,
  cutover: OpenkododMigrationSourceCutover
): void {
  const parsed = parseOpenkododMigrationSourceCutover(cutover)
  const existing = listOpenkododMigrationSourceCutovers(userDataPath)
  // Finished retained cutovers can wait two releases; only in-flight journals count toward the bound.
  const inFlight = existing.filter(
    (entry) => entry.phase !== 'source-retired' && !isRetainedOpenkododMigrationSourceCutover(entry)
  )
  if (
    !existing.some((entry) => entry.migrationId === parsed.migrationId) &&
    inFlight.length >= MAX_OPENKODOD_MIGRATION_SOURCE_CUTOVERS
  ) {
    throw new Error('openkodod_migration_cutover_capacity_exceeded')
  }
  journals.write(userDataPath, parsed)
}

export function removeOpenkododMigrationSourceCutover(
  userDataPath: string,
  migrationId: string
): void {
  journals.remove(userDataPath, migrationId)
}

export function removeOpenkododMigrationJournalsForDestination(
  userDataPath: string,
  sshTargetId: string,
  environmentId: string
): void {
  for (const cutover of listOpenkododMigrationSourceCutovers(userDataPath)) {
    if (cutover.sshTargetId === sshTargetId && cutover.destinationEnvironmentId === environmentId) {
      removeOpenkododMigrationSourceCutover(userDataPath, cutover.migrationId)
    }
  }
}
