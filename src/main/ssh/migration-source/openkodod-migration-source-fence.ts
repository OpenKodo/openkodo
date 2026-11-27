/** Persist journal, fence, then profile flush before remote calls. Crashes may leave a non-authoritative stale journal; a fence without a journal requires destination evidence before release. */
import { randomUUID } from 'node:crypto'
import { getManagedOpenkododFenceEnvironmentId } from '../../../shared/remote-runtime/ssh/managed-openkodod-ssh-owner'
import type { OpenkododMigrationBlocker } from '../../../shared/openkodod-migration/openkodod-migration-preflight'
import {
  OPENKODOD_MIGRATION_SOURCE_CUTOVER_VERSION,
  type OpenkododMigrationSourceCutover
} from '../../../shared/openkodod-migration/openkodod-migration-source-cutover'
import type { SshTarget } from '../../../shared/remote-runtime/ssh/ssh-types'
import { assertOpenkododMigrationRequestFits } from '../../managed-server/migration/catalog/openkodod-migration-request-budget'
import { createOpenkododMigrationManifest } from '../../persistence/migrating-openkodod-catalog/source/catalog/openkodod-migration-manifest-export'
import {
  findOpenkododMigrationSourceCutoverForTarget,
  removeOpenkododMigrationSourceCutover,
  writeOpenkododMigrationSourceCutover
} from '../../persistence/migrating-openkodod-catalog/cutover-journals/openkodod-migration-cutover-journal'
import {
  confirmOpenkododMigrationTerminalsUnderFence,
  type OpenkododMigrationTerminalVerdict
} from './openkodod-migration-terminal-gate'
import type { SshTargetOpenkododClaims } from '../targets/ssh-target-openkodod-claims'
import {
  isBlockingOpenkododMigrationBlocker,
  preflightOpenkododMigrationExport,
  type OpenkododMigrationPreflightStore
} from '../targets/ssh-target-openkodod-preflight'
import { openkododMigrationRefusalReason } from '../../managed-server/migration/cutover/openkodod-migration-refusal-reason'
import {
  preservesOpenkododMigrationBridgedPanes,
  type OpenkododMigrationPaneLeasePredicate
} from './openkodod-migration-bridged-panes'

export const OPENKODOD_MIGRATION_LEAVE_BEHIND_TERMINALS =
  'openkodod_migration_leave_behind_terminals'
export const OPENKODOD_MIGRATION_LEAVE_BEHIND_TERMINALS_REASON =
  'Move anyway needs every terminal on this host closed first, and OpenKodo could not confirm they all exited. Close them, or end them on the host, then connect again.'

export type OpenkododMigrationFenceState =
  | { state: 'none' }
  | { state: 'fenced'; cutover: OpenkododMigrationSourceCutover }
  /** Empty-host deploys record provisioning intent instead of a migration journal. */
  | { state: 'owned-by-deploy'; environmentId: string }
  /** Unexplained ownership requires recovery, never automatic release. */
  | { state: 'fenced-unverifiable'; environmentId: string }
  /** Stale journals grant no staging authority. */
  | { state: 'stale-journal'; cutover: OpenkododMigrationSourceCutover }

/** Throws when the journal cannot be read: an unreadable record keeps the host fenced. */
export function resolveOpenkododMigrationFence(
  userDataPath: string,
  target: SshTarget
): OpenkododMigrationFenceState {
  const cutover = findOpenkododMigrationSourceCutoverForTarget(userDataPath, target.id)
  const ownerEnvironmentId = getManagedOpenkododFenceEnvironmentId(target)
  if (cutover) {
    return ownerEnvironmentId === cutover.destinationEnvironmentId &&
      target.generation === cutover.sshTargetGeneration
      ? { state: 'fenced', cutover }
      : { state: 'stale-journal', cutover }
  }
  if (!ownerEnvironmentId) {
    return { state: 'none' }
  }
  return target.openkododProvisioning
    ? { state: 'owned-by-deploy', environmentId: ownerEnvironmentId }
    : { state: 'fenced-unverifiable', environmentId: ownerEnvironmentId }
}

export type OpenkododMigrationFenceResult =
  | { outcome: 'fenced'; cutover: OpenkododMigrationSourceCutover; resumed: boolean }
  | {
      outcome: 'refused'
      verdict: 'live' | 'unverifiable'
      code: string
      reason: string
      blockers?: OpenkododMigrationBlocker[]
    }

export async function fenceOpenkododMigrationSource(args: {
  userDataPath: string
  store: OpenkododMigrationPreflightStore
  claims: SshTargetOpenkododClaims
  targetId: string
  destinationEnvironmentId: string
  destinationName: string
  terminalProof: OpenkododMigrationTerminalVerdict
  isBridgedPaneLease?: OpenkododMigrationPaneLeasePredicate
  now?: () => Date
  signal?: AbortSignal
}): Promise<OpenkododMigrationFenceResult> {
  const target = args.store.getSshTarget(args.targetId)
  if (!target) {
    return refuse('unverifiable', 'openkodod_migration_target_not_found', 'The SSH host is gone.')
  }
  const existing = resolveOpenkododMigrationFence(args.userDataPath, target)
  if (existing.state === 'fenced') {
    return existing.cutover.destinationEnvironmentId === args.destinationEnvironmentId
      ? { outcome: 'fenced', cutover: existing.cutover, resumed: true }
      : refuse('live', 'openkodod_migration_in_progress', 'Another migration holds this SSH host.')
  }
  if (existing.state !== 'none') {
    return refuse(
      'unverifiable',
      `openkodod_migration_${existing.state.replaceAll('-', '_')}`,
      fenceStateReason(existing)
    )
  }
  const proof = args.terminalProof
  if (proof.verdict !== 'exited' && proof.verdict !== 'bridged') {
    return refuse(proof.verdict, 'openkodod_migration_terminals', proof.reason)
  }
  const preflight = preflightOpenkododMigrationExport(
    args.store,
    target.id,
    undefined,
    proof.verdict === 'bridged' ? proof.bridgedPtyIds : []
  )
  if (!preflight.claimable) {
    return {
      ...refuse(
        // Only a proven blocker reads live; one that is merely unanswered stays unverifiable.
        preflight.blockers
          .filter(isBlockingOpenkododMigrationBlocker)
          .every((blocker) => blocker.category === 'live-or-unverifiable')
          ? 'unverifiable'
          : 'live',
        'openkodod_migration_preflight_blocked',
        openkododMigrationRefusalReason(preflight.blockers)
      ),
      blockers: preflight.blockers
    }
  }
  const generation = args.claims.ensureGeneration(target.id)
  const now = (args.now ?? (() => new Date()))().toISOString()
  const manifest = createOpenkododMigrationManifest(
    args.store,
    { ...target, generation },
    { migrationId: randomUUID(), destinationEnvironmentId: args.destinationEnvironmentId }
  )
  if (
    proof.verdict === 'bridged' &&
    target.managedServerLeaveBehind &&
    !preservesOpenkododMigrationBridgedPanes(
      manifest.payload,
      args.store.getSshRemotePtyLeases(target.id),
      proof.bridgedPtyIds,
      args.isBridgedPaneLease
    )
  ) {
    return refuse(
      proof.relayVerdict,
      OPENKODOD_MIGRATION_LEAVE_BEHIND_TERMINALS,
      OPENKODOD_MIGRATION_LEAVE_BEHIND_TERMINALS_REASON
    )
  }
  // Reject before journaling so an unsendable manifest cannot pin the fence.
  assertOpenkododMigrationRequestFits({ manifest })
  const cutover: OpenkododMigrationSourceCutover = {
    version: OPENKODOD_MIGRATION_SOURCE_CUTOVER_VERSION,
    migrationId: manifest.migrationId,
    phase: 'source-fenced',
    startedAt: now,
    updatedAt: now,
    destinationEnvironmentId: args.destinationEnvironmentId,
    destinationName: args.destinationName,
    sshTargetId: target.id,
    sshTargetGeneration: generation,
    manifestSha256: manifest.manifestSha256,
    provenPtyIds: proof.verdict === 'exited' ? proof.provenPtyIds : [],
    ...(proof.verdict === 'bridged' ? { bridgedPtyIds: proof.bridgedPtyIds } : {}),
    // Capture before commit; this journaled export is the evidence of what the destination receives.
    manifest
  }
  writeOpenkododMigrationSourceCutover(args.userDataPath, cutover)
  args.claims.fenceForMigration(target.id, args.destinationEnvironmentId, generation)
  await args.claims.flush(args.signal)
  // Recheck under fence for terminals started after the original proof.
  const underFence = confirmOpenkododMigrationTerminalsUnderFence(
    args.store,
    target.id,
    args.terminalProof
  )
  if (underFence.verdict !== 'exited' && underFence.verdict !== 'bridged') {
    await releaseUnstagedFence(args, cutover)
    return refuse(underFence.verdict, 'openkodod_migration_terminals', underFence.reason)
  }
  return { outcome: 'fenced', cutover, resumed: false }
}

type FenceReleaseArgs = {
  userDataPath: string
  claims: SshTargetOpenkododClaims
  signal?: AbortSignal
}

async function releaseUnstagedFence(
  args: FenceReleaseArgs,
  cutover: OpenkododMigrationSourceCutover
): Promise<void> {
  if (cutover.phase !== 'source-fenced') {
    throw new Error('openkodod_migration_fence_release_after_stage')
  }
  await releaseOpenkododMigrationFence(args, cutover)
}

/** Drop owner before journal so an interrupted release leaves a harmless stale journal, never unexplained ownership. */
export async function releaseOpenkododMigrationFence(
  args: FenceReleaseArgs,
  cutover: OpenkododMigrationSourceCutover
): Promise<void> {
  args.claims.release(cutover.sshTargetId, cutover.destinationEnvironmentId)
  await args.claims.flush(args.signal)
  removeOpenkododMigrationSourceCutover(args.userDataPath, cutover.migrationId)
}

/** Unregistered destinations could stage nothing; registered destinations must prove durable abort instead. */
export async function releaseUndeployedMigrationFence(args: {
  userDataPath: string
  claims: SshTargetOpenkododClaims
  targetId: string
  isDestinationRegistered: (environmentId: string) => boolean | Promise<boolean>
  signal?: AbortSignal
}): Promise<'released' | 'none'> {
  const cutover = findOpenkododMigrationSourceCutoverForTarget(args.userDataPath, args.targetId)
  if (!cutover) {
    return 'none'
  }
  if (await args.isDestinationRegistered(cutover.destinationEnvironmentId)) {
    throw new Error('openkodod_migration_destination_registered')
  }
  await releaseUnstagedFence(args, cutover)
  return 'released'
}

function fenceStateReason(state: OpenkododMigrationFenceState): string {
  switch (state.state) {
    case 'owned-by-deploy':
      return 'OpenKodo already runs on this SSH host.'
    case 'fenced-unverifiable':
      return 'This SSH host is held for a migration whose record is missing. Recover it from this host’s OpenKodo server first.'
    case 'stale-journal':
      return 'A migration record names this SSH host but its fence is gone. Resolve that migration first.'
    case 'fenced':
    case 'none':
      return 'This SSH host is not in a state a migration can start from.'
  }
}

function refuse(
  verdict: 'live' | 'unverifiable',
  code: string,
  reason: string
): Extract<OpenkododMigrationFenceResult, { outcome: 'refused' }> {
  return { outcome: 'refused', verdict, code, reason }
}
