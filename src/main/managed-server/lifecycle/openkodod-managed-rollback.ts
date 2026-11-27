import {
  redactRuntimeEnvironment,
  type KnownRuntimeEnvironment
} from '../../../shared/remote-runtime/host-catalog/runtime-environments'

import type { OpenkododManagedRollbackResult } from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-managed-runtime'
import { probeActiveOpenkododReadiness } from '../activation/openkodod-active-readiness'
import { CURRENT_OPENKODOD_DAEMON_PROTOCOL } from '../activation/openkodod-daemon-protocol-crossing'
import {
  managedOpenkododInstallDir,
  managedOpenkododSlot,
  resolveLinkedOpenkododContext
} from './openkodod-managed-runtime-context'

import { readRemoteOpenkododBuildHash } from '../install/openkodod-remote-build-hash'
import { rollbackOpenkodod } from '../install/openkodod-remote-rollback'
import { collectManagedTerminalCensus } from './openkodod-terminal-census-client'
import { updateTerminalCounts } from '../activation/openkodod-fenced-stop'
import { findIncompleteManagedOpenkododMigration } from './openkodod-managed-migration-status'
import { latestOpenkododMigrationInto } from '../../persistence/migrating-openkodod-catalog/cutover-journals/openkodod-migration-rollback-mark'
import { refreshMaintainedOpenkododPairing } from './openkodod-maintenance-pairing-refresh'

import {
  type LifecycleArgs,
  withManagedOpenkododLifecycle,
  followLaunchedServerPort
} from './openkodod-managed-lifecycle'

export async function rollbackManagedOpenkododEnvironment(
  userDataPath: string,
  args: LifecycleArgs
): Promise<OpenkododManagedRollbackResult> {
  return await withManagedOpenkododLifecycle(
    userDataPath,
    args.selector,
    async ({ environment, deployment }) => {
      const context = await resolveLinkedOpenkododContext(environment, deployment, args.signal)
      const record = context.activationRecord
      const target = record.previous
      if (!target) {
        return {
          outcome: 'refused',
          code: 'openkodod_rollback_no_target',
          reason: 'This server has no previous version to roll back to.'
        }
      }
      const crossing = migrationRollbackRefusal(userDataPath, environment, record.activatedAt)
      if (crossing) {
        return crossing
      }
      const slot = managedOpenkododSlot(context, deployment.remotePort, args.signal)
      const targetDir = managedOpenkododInstallDir(context, target)
      const targetBuildHash = await readRemoteOpenkododBuildHash(slot, targetDir)
      const { countFirst, ...recount } = updateTerminalCounts((options) =>
        collectManagedTerminalCensus(userDataPath, environment, record, undefined, options)
      )
      // Recount under lock before rollback stop; this initial census closes no admission.
      const census = await countFirst()
      // Require idle because this client cannot prove the older build's daemon protocol attaches to live terminals.
      if (census.liveSessions !== 0) {
        return {
          outcome: 'refused',
          code:
            census.liveSessions === null
              ? 'openkodod_rollback_census_unavailable'
              : 'openkodod_rollback_terminals_running',
          reason:
            census.liveSessions === null
              ? 'The server did not answer how many terminals it runs. Retry when it answers.'
              : 'Close the terminals running on this server before rolling it back.'
        }
      }
      const result = await rollbackOpenkodod({
        ...slot,
        record,
        census,
        ...recount,
        targetBuildHash,
        targetDaemonProtocol: CURRENT_OPENKODOD_DAEMON_PROTOCOL
      })
      if (result.outcome !== 'rolled-back') {
        return result
      }
      const readiness = await probeActiveOpenkododReadiness(
        { ...slot, remoteInstallDir: targetDir },
        { buildHash: targetBuildHash, fullVersion: result.target }
      )
      const updated = await refreshMaintainedOpenkododPairing(
        userDataPath,
        environment.id,
        readiness
      )
      await followLaunchedServerPort(userDataPath, environment.id)
      return {
        outcome: 'rolled-back',
        environment: redactRuntimeEnvironment(updated),
        activeVersion: result.target,
        discarded: result.discarded
      }
    }
  )
}

/** A post-activation migration is absent from the rollback snapshot; restoring it would discard imported state. */
function migrationRollbackRefusal(
  userDataPath: string,
  environment: KnownRuntimeEnvironment,
  activatedAt: string | null
): OpenkododManagedRollbackResult | null {
  if (findIncompleteManagedOpenkododMigration(userDataPath, environment.id)) {
    return {
      outcome: 'refused',
      code: 'openkodod_rollback_migration_in_progress',
      reason: 'A migration into this server is still running. Finish it before rolling back.'
    }
  }
  const migratedAt = latestOpenkododMigrationInto(userDataPath, environment)
  if (migratedAt && (activatedAt === null || Date.parse(activatedAt) < Date.parse(migratedAt))) {
    return {
      outcome: 'refused',
      code: 'openkodod_rollback_crosses_migration',
      reason:
        "The previous version's state predates the projects migrated onto this server; " +
        'rolling back would lose them. Deploy forward instead.'
    }
  }
  return null
}
