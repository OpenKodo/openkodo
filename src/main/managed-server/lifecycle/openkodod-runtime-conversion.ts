// Resume journaled migrations after lost contact; source rows stay authoritative until proven commit.
// Retain source rows afterwards for downgrade compatibility.
import { randomUUID } from 'node:crypto'
import type { OpenkododManagedConversionResult } from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-managed-runtime'
import type { OpenkododMigrationSourceCutover } from '../../../shared/openkodod-migration/openkodod-migration-source-cutover'
import { recordManagedOpenkododMigration } from '../../../shared/remote-runtime/host-store/runtime-environment-managed-openkodod-store'
import { listEnvironments } from '../../../shared/remote-runtime/host-store/runtime-environment-store'
import {
  getOpenkododSshDeployment,
  redactRuntimeEnvironment,
  type KnownRuntimeEnvironment
} from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import { runTargetLifecycle } from '../../ipc/ssh/ssh-target-lifecycle-queue'
import { environmentMatchesManagedOpenkododCutover } from './openkodod-managed-migration-status'
import { requireManagedOpenkododInfrastructure } from './openkodod-managed-runtime-context'
import { ensureOpenkododManagedTunnel } from './openkodod-managed-tunnel'
import {
  commitOpenkododMigrationDestination,
  type OpenkododMigrationDestinationCatalog
} from '../migration/cutover/openkodod-migration-cutover-coordinator'
import {
  findOpenkododMigrationSourceCutoverForTarget,
  removeOpenkododMigrationJournalsForDestination
} from '../../persistence/migrating-openkodod-catalog/cutover-journals/openkodod-migration-cutover-journal'
import type { SshTarget } from '../../../shared/remote-runtime/ssh/ssh-types'
import type { CensusHostRelayTerminals } from '../../ssh/migration-source/openkodod-migration-terminal-gate'
import { createManagedOpenkododEnvironment } from './openkodod-runtime-deployment'
import { createSshRelayMigrationSource } from '../../ssh/migration-source/openkodod-migration-ssh-relay-source'
import {
  leaveBehindClearsOpenkododMigrationBlockers,
  onlyLeavableOpenkododMigrationBlockers
} from '../../ssh/targets/ssh-target-openkodod-preflight'
import { OPENKODOD_MIGRATION_LEAVE_BEHIND_TERMINALS_REASON } from '../../ssh/migration-source/openkodod-migration-source-fence'
import type { OpenkododMigrationPaneLeasePredicate } from '../../ssh/migration-source/openkodod-migration-bridged-panes'
import { retainOpenkododMigrationSource } from '../../persistence/migrating-openkodod-catalog/retained-source/openkodod-migration-source-retention'
import {
  enableMovedOpenkododAutomations,
  type EnableServerAutomation
} from '../../persistence/migrating-openkodod-catalog/retained-source/openkodod-migration-moved-automations'
import {
  linkedOpenkododMigrationCutoverPort,
  linkedOpenkododMigrationProjects,
  linkServerHeldRepositories
} from '../migration/linking/openkodod-migration-repository-link'
import type { OpenkododServerRepository } from '../migration/linking/openkodod-server-repositories'
import type { OpenkododServerFolderCatalog } from '../migration/linking/openkodod-server-folder-workspaces'

export type OpenkododManagedConversionArgs = {
  sshTargetId: string
  name: string
  censusHost?: ((target: SshTarget) => ReturnType<CensusHostRelayTerminals>) | null
  isBridgedPaneLease?: OpenkododMigrationPaneLeasePredicate
  destinationFor: (environment: KnownRuntimeEnvironment) => OpenkododMigrationDestinationCatalog
  /** Link matching host paths to existing server projects. */
  serverRepositoriesFor?: (
    environment: KnownRuntimeEnvironment
  ) => Promise<OpenkododServerRepository[]>
  /** Link folder workspaces already present from earlier moves. */
  serverFolderCatalogFor?: (
    environment: KnownRuntimeEnvironment
  ) => Promise<OpenkododServerFolderCatalog>
  releaseDirectSession?: (sshTargetId: string) => Promise<void>
  /** Re-enables moved automations that ran on this desktop. */
  serverAutomationEnablerFor?: (environment: KnownRuntimeEnvironment) => EnableServerAutomation
  now?: () => Date
  signal?: AbortSignal
}

export async function convertSshTargetToManagedOpenkodod(
  userDataPath: string,
  args: OpenkododManagedConversionArgs
): Promise<OpenkododManagedConversionResult> {
  const fenced = await fenceOrResume(userDataPath, args)
  if ('outcome' in fenced) {
    return fenced
  }
  const deployed = await createManagedOpenkododEnvironment(userDataPath, {
    name: fenced.destinationName,
    sshTargetId: fenced.sshTargetId,
    migration: true,
    signal: args.signal
  })
  if (deployed.outcome === 'deferred') {
    return deployed // Retain fence and journal for a later resume.
  }
  const environment = (await listEnvironments(userDataPath)).find(
    (entry) => entry.id === fenced.destinationEnvironmentId
  )
  if (!environment || !environmentMatchesManagedOpenkododCutover(environment, fenced)) {
    throw new Error('openkodod_migration_destination_environment_mismatch')
  }
  // Record before commit so crashes cannot allow rollback across migrated state.
  await recordManagedOpenkododMigration(
    userDataPath,
    environment.id,
    (args.now ?? (() => new Date()))().toISOString()
  )
  // Tunnel repair may replace pairing credentials; use its returned environment for every request.
  const marked = await ensureOpenkododManagedTunnel(userDataPath, environment.id)
  const { claims, targetStore } = requireManagedOpenkododInfrastructure()
  const store = targetStore.getOpenkododMigrationSource()
  const destination = args.destinationFor(marked)
  const serverRepositoriesFor = args.serverRepositoriesFor
  const serverFolderCatalogFor = args.serverFolderCatalogFor
  let linked: Pick<
    OpenkododMigrationSourceCutover,
    'linkedRepositoryIds' | 'linkedFolderWorkspaceIds'
  > = {}
  const committed = await runTargetLifecycle(fenced.sshTargetId, async () => {
    const journaled = requireJournaledCutover(userDataPath, fenced)
    const cutover = serverRepositoriesFor
      ? await linkServerHeldRepositories({
          userDataPath,
          store,
          claims,
          cutover: journaled,
          destination,
          serverRepositories: () => serverRepositoriesFor(marked),
          ...(serverFolderCatalogFor
            ? { serverFolderCatalog: () => serverFolderCatalogFor(marked) }
            : {}),
          now: args.now
        })
      : journaled
    linked = cutover
    return commitOpenkododMigrationDestination(
      {
        userDataPath,
        store,
        claims,
        source: linkedOpenkododMigrationCutoverPort({ userDataPath, store, claims, cutover }),
        destination,
        now: args.now
      },
      cutover.migrationId
    )
  })
  if (committed.phase !== 'destination-committed' && committed.phase !== 'source-retired') {
    throw new Error(`openkodod_migration_commit_not_proven:${committed.phase}`)
  }
  let automationsLeftDisabled = 0
  if (committed.phase === 'destination-committed') {
    await retainOpenkododMigrationSource(userDataPath, committed.migrationId, store, args.now)
    if (args.serverAutomationEnablerFor) {
      automationsLeftDisabled = await enableMovedOpenkododAutomations(
        userDataPath,
        committed.migrationId,
        args.serverAutomationEnablerFor(marked)
      ).catch((error: unknown) => {
        console.warn('[ssh] Could not re-enable moved automations:', error)
        return 0
      })
    }
  }
  const linkedProjects = linkedOpenkododMigrationProjects(store, linked)
  return {
    outcome: 'converted',
    environment: redactRuntimeEnvironment(marked),
    migrationId: committed.migrationId,
    ...(linkedProjects.length > 0 ? { linkedProjects } : {}),
    ...(automationsLeftDisabled > 0 ? { automationsLeftDisabled } : {})
  }
}

async function fenceOrResume(
  userDataPath: string,
  args: OpenkododManagedConversionArgs
): Promise<
  | OpenkododMigrationSourceCutover
  | Extract<OpenkododManagedConversionResult, { outcome: 'refused' }>
> {
  const { claims, targetStore } = requireManagedOpenkododInfrastructure()
  const target = targetStore.getTarget(args.sshTargetId)
  if (!target) {
    return refuse('unverifiable', 'openkodod_migration_target_not_found', 'The SSH host is gone.')
  }
  const store = targetStore.getOpenkododMigrationSource()
  const censusHost = args.censusHost
  const source = createSshRelayMigrationSource({
    userDataPath,
    store,
    claims,
    target,
    censusHost: censusHost ? () => censusHost(target) : null,
    isBridgedPaneLease: args.isBridgedPaneLease
  })
  const existing = source.resolveFence()
  if (existing.state === 'fenced') {
    return existing.cutover
  }
  const stale = existing.state === 'stale-journal' ? existing.cutover : null
  if (stale && !(await isRegistered(userDataPath, stale.destinationEnvironmentId))) {
    removeOpenkododMigrationJournalsForDestination(
      userDataPath,
      target.id,
      stale.destinationEnvironmentId
    )
  }
  const converted = (await listEnvironments(userDataPath)).some(
    (environment) => getOpenkododSshDeployment(environment)?.sshTargetId === target.id
  )
  if (converted) {
    return refuse(
      'live',
      'openkodod_migration_already_managed',
      'OpenKodo already runs on this SSH host.'
    )
  }
  // Source fencing rechecks leases after acquisition.
  const terminalProof = await source.assessTerminals()
  if (terminalProof.verdict === 'live' || terminalProof.verdict === 'unverifiable') {
    return refuse(terminalProof.verdict, 'openkodod_migration_terminals', terminalProof.reason)
  }
  source.retireProvenExitedTerminals(terminalProof)
  await args.releaseDirectSession?.(target.id)
  const result = await runTargetLifecycle(target.id, () =>
    source.acquireFence({
      destinationEnvironmentId: randomUUID(),
      destinationName: args.name,
      terminalProof,
      now: args.now,
      signal: args.signal
    })
  )
  if (result.outcome === 'fenced') {
    return result.cutover
  }
  if (result.blockers?.length) {
    // Surface blocked state in logs because connect shows only the summary reason.
    console.warn(
      '[ssh] Conversion refused by:',
      JSON.stringify(
        result.blockers.map((blocker) =>
          'dependencies' in blocker
            ? { code: blocker.code, dependencies: blocker.dependencies }
            : { code: blocker.code }
        )
      )
    )
  }
  const leavable =
    result.blockers &&
    onlyLeavableOpenkododMigrationBlockers(result.blockers) &&
    !target.managedServerLeaveBehind
  const canLeaveBehind =
    leavable &&
    leaveBehindClearsOpenkododMigrationBlockers(
      store,
      target.id,
      terminalProof.verdict === 'bridged' ? terminalProof.bridgedPtyIds : [],
      args.isBridgedPaneLease
    )
  if (leavable && terminalProof.verdict !== 'exited' && !canLeaveBehind) {
    // Leaving tabs behind would strand terminals still served by the legacy bridge.
    return refuse(
      result.verdict,
      result.code,
      `${result.reason} ${OPENKODOD_MIGRATION_LEAVE_BEHIND_TERMINALS_REASON}`
    )
  }
  return {
    ...refuse(result.verdict, result.code, result.reason),
    // Preview confirmation to avoid offering an export the confirmed path would refuse.
    ...(canLeaveBehind ? { canLeaveBehind: true } : {})
  }
}

function requireJournaledCutover(
  userDataPath: string,
  fenced: OpenkododMigrationSourceCutover
): OpenkododMigrationSourceCutover {
  const journaled = findOpenkododMigrationSourceCutoverForTarget(userDataPath, fenced.sshTargetId)
  if (journaled?.migrationId !== fenced.migrationId) {
    throw new Error('openkodod_migration_source_fence_lost')
  }
  return journaled
}

async function isRegistered(userDataPath: string, environmentId: string): Promise<boolean> {
  return (await listEnvironments(userDataPath)).some(
    (environment) => environment.id === environmentId
  )
}

function refuse(
  verdict: 'live' | 'unverifiable',
  code: string,
  reason: string
): Extract<OpenkododManagedConversionResult, { outcome: 'refused' }> {
  return { outcome: 'refused', verdict, code, reason }
}
