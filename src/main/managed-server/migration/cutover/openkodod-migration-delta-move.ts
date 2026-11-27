/** Journal only additions made after conversion to the same server; retain the full journal chain and source rows. Stage conflicts leave the changed mark and source intact; uncertain outcomes keep the journal for resume. */
import {
  OPENKODOD_MIGRATION_SOURCE_CUTOVER_VERSION,
  type OpenkododMigrationSourceCutover
} from '../../../../shared/openkodod-migration/openkodod-migration-source-cutover'
import type { OpenkododDeltaMoveResult } from '../../../../shared/remote-runtime/openkodod-lifecycle/openkodod-managed-runtime'
import { recordManagedOpenkododMigration } from '../../../../shared/remote-runtime/host-store/runtime-environment-managed-openkodod-store'
import type { KnownRuntimeEnvironment } from '../../../../shared/remote-runtime/host-catalog/runtime-environments'
import type { SshTarget } from '../../../../shared/remote-runtime/ssh/ssh-types'
import type { Store } from '../../../persistence/loading-store/store'
import {
  abortOpenkododMigrationCutover,
  commitOpenkododMigrationDestination,
  type OpenkododMigrationCutoverContext,
  type OpenkododMigrationDestinationCatalog
} from './openkodod-migration-cutover-coordinator'
import {
  findOpenkododMigrationSourceCutoverForTarget,
  listOpenkododMigrationCutoverChainForTarget,
  removeOpenkododMigrationSourceCutover,
  writeOpenkododMigrationSourceCutover
} from '../../../persistence/migrating-openkodod-catalog/cutover-journals/openkodod-migration-cutover-journal'
import {
  committedOpenkododMigrationChain,
  openkododDeltaSourceStore,
  planOpenkododDeltaMove,
  unfinishedOpenkododDelta,
  type OpenkododDeltaMovePlan
} from './openkodod-migration-delta-plan'
import { assertOpenkododMigrationRequestFits } from '../catalog/openkodod-migration-request-budget'
import { retainOpenkododMigrationSource } from '../../../persistence/migrating-openkodod-catalog/retained-source/openkodod-migration-source-retention'
import {
  assessOpenkododMigrationTerminals,
  type OpenkododMigrationTerminalVerdict,
  retireProvenExitedLeases,
  type CensusHostRelayTerminals
} from '../../../ssh/migration-source/openkodod-migration-terminal-gate'
import {
  currentOpenkododSourceFingerprint,
  openkododCatalogFingerprint,
  unmovedOpenkododSourceRows,
  withKeptOpenkododSourceRows
} from '../../../persistence/migrating-openkodod-catalog/retained-source/openkodod-retained-source'
import { collectOpenkododMigrationSourceCatalog } from '../../../persistence/migrating-openkodod-catalog/source/catalog/openkodod-source-catalog'
import type { SshTargetOpenkododClaims } from '../../../ssh/targets/ssh-target-openkodod-claims'
import { openkododMigrationRefusalReason } from './openkodod-migration-refusal-reason'
import { errorMessage } from '../../../../shared/errors/error-message'

type OpenkododDeltaMoveArgs = {
  userDataPath: string
  store: Store
  claims: SshTargetOpenkododClaims
  target: SshTarget
  environment: KnownRuntimeEnvironment
  /** Build the destination after opening its tunnel: re-pairing during open can replace commit credentials. */
  connectDestination: () => Promise<OpenkododMigrationDestinationCatalog>
  /** Host census proves exit or identifies terminals preserved by the legacy bridge. */
  censusHost?: CensusHostRelayTerminals | null
  /** Serialize journal-through-commit with all other lifecycle changes to this host. */
  runTargetLifecycle: <T>(targetId: string, operation: () => Promise<T>) => Promise<T>
  now?: () => Date
}

export async function runOpenkododDeltaMove(
  args: OpenkododDeltaMoveArgs
): Promise<OpenkododDeltaMoveResult> {
  const { userDataPath, store, target } = args
  const now = args.now ?? (() => new Date())
  const plan = planOpenkododDeltaMove(userDataPath, store, target, { now })
  // Capture baseline with the manifest before awaiting so both describe the same source.
  const planned = currentOpenkododSourceFingerprint(store, target)
  if (!plan.resumes && plan.added.length === 0) {
    return refuse('openkodod_delta_nothing_new', 'An older build added nothing new to move.')
  }
  if (plan.blockers.length > 0) {
    return {
      ...refuse(
        'openkodod_migration_preflight_blocked',
        openkododMigrationRefusalReason(plan.blockers)
      ),
      blockers: plan.blockers
    }
  }
  if (!plan.resumes) {
    // Reject before journaling or an unsendable delta could pin the fence permanently.
    assertOpenkododMigrationRequestFits({ manifest: plan.manifest })
  }
  const terminals = await assessOpenkododMigrationTerminals(store, target.id, args.censusHost)
  if (terminals.verdict !== 'exited' && terminals.verdict !== 'bridged') {
    return refuse('openkodod_migration_terminals', terminals.reason)
  }
  const settled: SettledTerminals = terminals
  retireProvenExitedLeases(store, target.id, terminals)
  return args.runTargetLifecycle(target.id, async () => {
    // Another move may have journaled or finished while waiting for the lifecycle lock.
    const changedAt = store.getSshTarget(target.id)?.openkododFence?.sourceChangedAt
    const head = findOpenkododMigrationSourceCutoverForTarget(userDataPath, target.id)
    if (!changedAt || head?.migrationId !== (plan.resumes ?? plan.head).migrationId) {
      return refuse('openkodod_delta_superseded', 'Another move of this host ran first.')
    }
    // Source remains writable before fencing; edits during census must not silently become the manifest's baseline.
    if (!plan.resumes && planned !== currentOpenkododSourceFingerprint(store, target)) {
      return refuse(
        'openkodod_delta_source_changed',
        'This host changed while the move was starting. Try the move again.'
      )
    }
    const cutover = plan.resumes ?? journalDelta(args, plan, planned, settled, now)
    return commitDelta(args, plan, cutover, changedAt, now)
  })
}

type SettledTerminals = Extract<
  OpenkododMigrationTerminalVerdict,
  { verdict: 'exited' | 'bridged' }
>

function journalDelta(
  args: OpenkododDeltaMoveArgs,
  plan: OpenkododDeltaMovePlan,
  planned: string,
  terminals: SettledTerminals,
  now: () => Date
): OpenkododMigrationSourceCutover {
  const timestamp = now().toISOString()
  const cutover: OpenkododMigrationSourceCutover = {
    version: OPENKODOD_MIGRATION_SOURCE_CUTOVER_VERSION,
    migrationId: plan.manifest.migrationId,
    phase: 'source-fenced',
    startedAt: timestamp,
    updatedAt: timestamp,
    destinationEnvironmentId: plan.environmentId,
    destinationName: plan.head.destinationName,
    sshTargetId: args.target.id,
    sshTargetGeneration: plan.head.sshTargetGeneration,
    manifestSha256: plan.manifest.manifestSha256,
    provenPtyIds: terminals.verdict === 'exited' ? terminals.provenPtyIds : [],
    // COMPAT(legacy-relay-bridge): a move leaves relay terminals running for the bridge too.
    ...(terminals.verdict === 'bridged' ? { bridgedPtyIds: terminals.bridgedPtyIds } : {}),
    supersedesMigrationId: plan.head.migrationId,
    // Retained rows must match the whole source captured with this manifest.
    sourceBaselineFingerprint: planned,
    manifest: plan.manifest
  }
  writeOpenkododMigrationSourceCutover(args.userDataPath, cutover)
  return cutover
}

async function commitDelta(
  args: OpenkododDeltaMoveArgs,
  plan: OpenkododDeltaMovePlan,
  cutover: OpenkododMigrationSourceCutover,
  changedAt: string,
  now: () => Date
): Promise<OpenkododDeltaMoveResult> {
  const { userDataPath, store, target } = args
  // Clear the changed mark and freeze source for the move.
  store.updateSshTarget(target.id, { openkododFence: { environmentId: plan.environmentId } })
  await args.claims.flush()
  // Record before any new/resumed commit so rollback cannot cross the migration.
  await recordManagedOpenkododMigration(userDataPath, plan.environmentId, now().toISOString())
  let destination: OpenkododMigrationDestinationCatalog
  try {
    destination = await args.connectDestination()
  } catch (error) {
    // No request reached the server; keep the journal for later resume.
    await restoreChangedMark(args, cutover, changedAt)
    throw error
  }
  const context: OpenkododMigrationCutoverContext = {
    userDataPath,
    store: plan.source,
    freshSource: () => openkododDeltaSourceStore(store, target, plan.moved, cutover.manifest),
    claims: args.claims,
    destination,
    now
  }
  try {
    const committed = await commitOpenkododMigrationDestination(context, cutover.migrationId)
    if (committed.phase !== 'destination-committed' && committed.phase !== 'source-retired') {
      throw new Error(`openkodod_migration_commit_not_proven:${committed.phase}`)
    }
  } catch (error) {
    const released = await releaseUncommittedDelta(args, context, cutover, changedAt)
    if (released === 'released') {
      return refuse('openkodod_delta_refused_by_server', errorMessage(error))
    }
    if (released === 'kept') {
      throw error
    }
  }
  await retainOpenkododMigrationSource(userDataPath, cutover.migrationId, store, now)
  return { outcome: 'moved', migrationId: cutover.migrationId }
}

/** Release only on proven destination absence; otherwise retain journal for resume. Restore the host's changed mark either way. */
async function releaseUncommittedDelta(
  args: OpenkododDeltaMoveArgs,
  context: OpenkododMigrationCutoverContext,
  cutover: OpenkododMigrationSourceCutover,
  changedAt: string
): Promise<'released' | 'committed' | 'kept'> {
  const restoreMark = (): Promise<void> => restoreChangedMark(args, cutover, changedAt)
  try {
    const result = await abortOpenkododMigrationCutover(context, cutover.migrationId, async () => {
      // Restore the mark first so a crash during journal removal leaves a resumable marked host.
      await restoreMark()
      removeOpenkododMigrationSourceCutover(args.userDataPath, cutover.migrationId)
    })
    return result.outcome === 'released' ? 'released' : 'committed'
  } catch {
    await restoreMark()
    return 'kept'
  }
}

async function restoreChangedMark(
  args: Pick<OpenkododDeltaMoveArgs, 'store' | 'claims'>,
  cutover: OpenkododMigrationSourceCutover,
  changedAt: string
): Promise<void> {
  args.store.updateSshTarget(cutover.sshTargetId, {
    openkododFence: { environmentId: cutover.destinationEnvironmentId, sourceChangedAt: changedAt }
  })
  await args.claims.flush()
}

/** Keep older-build changes only in retained profile rows. */
export async function keepOpenkododServerVersion(args: {
  userDataPath: string
  store: Store
  claims: SshTargetOpenkododClaims
  target: SshTarget
}): Promise<void> {
  const environmentId = args.target.openkododFence?.environmentId
  const chain = listOpenkododMigrationCutoverChainForTarget(args.userDataPath, args.target.id)
  if (unfinishedOpenkododDelta(chain)) {
    // Unfinished moves may already have copied rows; only commit/abort can decide.
    throw new Error('openkodod_delta_move_unfinished')
  }
  const head = committedOpenkododMigrationChain(chain).at(-1)
  if (!environmentId || !args.target.openkododFence?.sourceChangedAt || !head) {
    throw new Error('openkodod_delta_not_changed')
  }
  const current = collectOpenkododMigrationSourceCatalog(args.store, args.target)
  const unmoved = unmovedOpenkododSourceRows(current, committedOpenkododMigrationChain(chain))
  writeOpenkododMigrationSourceCutover(args.userDataPath, {
    ...withKeptOpenkododSourceRows(head, unmoved),
    // Explicit reconcile accepts the current retained source as the new baseline.
    sourceBaselineFingerprint: openkododCatalogFingerprint(current)
  })
  args.store.updateSshTarget(args.target.id, { openkododFence: { environmentId } })
  await args.claims.flush()
}

function refuse(
  code: string,
  reason: string
): Extract<OpenkododDeltaMoveResult, { outcome: 'refused' }> {
  return { outcome: 'refused', code, reason }
}
