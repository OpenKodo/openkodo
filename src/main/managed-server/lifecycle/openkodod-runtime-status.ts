import type { OpenkododManagedRuntimeStatus } from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-managed-runtime'
import { runTargetLifecycle } from '../../ipc/ssh/ssh-target-lifecycle-queue'
import type { OpenkododActivationTransaction } from '../activation/openkodod-activation-transaction'
import { readOpenkododActivationTransaction } from '../activation/openkodod-activation-transaction-store'
import {
  requireManagedOpenkododEnvironment,
  resolveLinkedOpenkododContext
} from './openkodod-managed-runtime-context'
import { currentManagedOpenkododUpdateDeferral } from './openkodod-managed-update-deferrals'
import { findIncompleteManagedOpenkododMigration } from './openkodod-managed-migration-status'
import { collectManagedTerminalCensus } from './openkodod-terminal-census-client'
import { getAppEnvironment } from '../../../shared/app-lifecycle/app-environment'
import { bundledManagedOpenkododVersion } from './openkodod-managed-auto-update'
import { availableManagedOpenkododUpdate } from './openkodod-managed-update-decision'

/** Read host records without repairing them. */
export async function getManagedOpenkododRuntimeStatus(
  userDataPath: string,
  selector: string,
  signal?: AbortSignal
): Promise<OpenkododManagedRuntimeStatus> {
  const { environment, deployment } = await requireManagedOpenkododEnvironment(
    userDataPath,
    selector
  )
  const { status, record, serverTarget } = await runTargetLifecycle(
    deployment.sshTargetId,
    async () => {
      const context = await resolveLinkedOpenkododContext(environment, deployment, signal)
      const record = context.activationRecord
      const transaction = await readOpenkododActivationTransaction({
        conn: context.connection,
        host: context.host,
        remoteHome: context.remoteHome,
        signal
      })
      const status: OpenkododManagedRuntimeStatus = {
        environmentId: environment.id,
        sshTargetId: context.target.id,
        activeVersion: record.active,
        activeAppVersion: record.active ? (record.activeAppVersion ?? null) : null,
        previousVersion: record.previous,
        activatedAt: record.activatedAt,
        rollbackAvailable: Boolean(record.previous && record.snapshot),
        recovery: transaction ? managedRecoveryStatus(transaction) : null,
        terminals: await collectManagedTerminalCensus(userDataPath, environment, record),
        migration: migrationStatus(userDataPath, environment.id),
        deferredUpdate: currentManagedOpenkododUpdateDeferral(environment.id, record)
      }
      return { status, record, serverTarget: context.serverTarget }
    }
  )
  // Outside the host queue: hashing the local template must not hold up host actions.
  // A local template fault hides only the offer, never the host's status.
  const candidateVersion = await bundledManagedOpenkododVersion(serverTarget).catch(() => null)
  return {
    ...status,
    availableUpdate: availableManagedOpenkododUpdate({
      record,
      candidateVersion,
      appVersion: getAppEnvironment().getVersion(),
      deferredCandidateVersion: status.deferredUpdate?.candidateVersion ?? null
    })
  }
}

function managedRecoveryStatus(
  transaction: OpenkododActivationTransaction
): NonNullable<OpenkododManagedRuntimeStatus['recovery']> {
  switch (transaction.operation) {
    case 'activate':
      return {
        operation: transaction.operation,
        phase: transaction.phase,
        version: transaction.candidateVersion,
        startedAt: transaction.startedAt
      }
    case 'rollback':
      return {
        operation: transaction.operation,
        phase: transaction.phase,
        version: transaction.targetVersion,
        startedAt: transaction.startedAt
      }
    case 'decommission':
      return {
        operation: transaction.operation,
        phase: transaction.phase,
        version: transaction.activeVersion,
        startedAt: transaction.startedAt
      }
  }
}

function migrationStatus(
  userDataPath: string,
  environmentId: string
): OpenkododManagedRuntimeStatus['migration'] {
  const migration = findIncompleteManagedOpenkododMigration(userDataPath, environmentId)
  return migration
    ? { migrationId: migration.migrationId, phase: migration.phase, startedAt: migration.startedAt }
    : null
}
