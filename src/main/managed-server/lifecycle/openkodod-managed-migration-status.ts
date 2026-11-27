import {
  isRetainedOpenkododMigrationSourceCutover,
  type OpenkododMigrationSourceCutover
} from '../../../shared/openkodod-migration/openkodod-migration-source-cutover'
import {
  getOpenkododSshDeployment,
  type KnownRuntimeEnvironment
} from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import { listOpenkododMigrationSourceCutovers } from '../../persistence/migrating-openkodod-catalog/cutover-journals/openkodod-migration-cutover-journal'

type OpenkododManagedPendingMigration = {
  migrationId: string
  environmentId: string
  name: string
  sshTargetId: string
  phase: OpenkododMigrationSourceCutover['phase']
  startedAt: string
}

/** Unreadable journals must not look like absent migrations. */
export function listPendingManagedOpenkododMigrations(
  userDataPath: string
): OpenkododManagedPendingMigration[] {
  return (
    listOpenkododMigrationSourceCutovers(userDataPath)
      // Committed/retained journals preserve downgrade recovery, not pending migration work.
      .filter(
        (cutover) =>
          cutover.phase !== 'source-retired' && !isRetainedOpenkododMigrationSourceCutover(cutover)
      )
      .map((cutover) => ({
        migrationId: cutover.migrationId,
        environmentId: cutover.destinationEnvironmentId,
        name: cutover.destinationName,
        sshTargetId: cutover.sshTargetId,
        phase: cutover.phase,
        startedAt: cutover.startedAt
      }))
  )
}

export function findIncompleteManagedOpenkododMigration(
  userDataPath: string,
  environmentId: string
): OpenkododManagedPendingMigration | null {
  return (
    listPendingManagedOpenkododMigrations(userDataPath).find(
      (migration) => migration.environmentId === environmentId
    ) ?? null
  )
}

export function environmentMatchesManagedOpenkododCutover(
  environment: KnownRuntimeEnvironment,
  cutover: OpenkododMigrationSourceCutover
): boolean {
  const deployment = getOpenkododSshDeployment(environment)
  return (
    environment.id === cutover.destinationEnvironmentId &&
    environment.name === cutover.destinationName &&
    deployment?.sshTargetId === cutover.sshTargetId &&
    deployment.sshTargetGeneration === cutover.sshTargetGeneration
  )
}
