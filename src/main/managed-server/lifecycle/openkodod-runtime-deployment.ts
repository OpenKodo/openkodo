// Target claims preserve environment identity so interrupted deploys resume the same registration.
import { getAppEnvironment } from '../../../shared/app-lifecycle/app-environment'
import { randomUUID } from 'node:crypto'
import { assertRuntimeEnvironmentNotReconciling } from '../../../shared/remote-runtime/host-catalog/runtime-environment-reconciliation-record'
import { listEnvironments } from '../../../shared/remote-runtime/host-store/runtime-environment-store'
import { addManagedOpenkododEnvironment } from '../../../shared/remote-runtime/host-store/runtime-environment-managed-openkodod-store'
import {
  getOpenkododSshDeployment,
  redactRuntimeEnvironment
} from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import {
  OPENKODOD_MANAGED_REMOTE_PORT,
  type OpenkododManagedDeferral,
  type OpenkododManagedDeployResult
} from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-managed-runtime'
import { getManagedOpenkododFenceEnvironmentId } from '../../../shared/remote-runtime/ssh/managed-openkodod-ssh-owner'
import { runTargetLifecycle } from '../../ipc/ssh/ssh-target-lifecycle-queue'
import { materializeOpenkododArtifact } from '../../openkodod/artifact-slots/openkodod-artifact-materializer'
import {
  closeOpenkododManagedTunnel,
  ensureOpenkododManagedTunnel,
  startOpenkododManagedTunnel
} from './openkodod-managed-tunnel'
import { recoverInterruptedOpenkododActivation } from '../activation/openkodod-activation-recovery'
import { wakeAlreadyActiveOpenkodod } from './openkodod-already-active-wake'
import { readOpenkododActivationRecord } from '../activation/openkodod-activation-record-store'
import {
  resolveOpenkododRemoteContext,
  type OpenkododRemoteContext
} from '../install/openkodod-remote-context'
import { deployOpenkodod } from '../install/openkodod-remote-deploy'
import {
  adoptRunningOpenkododVersion,
  type OpenkododRunningAdoption
} from '../activation/openkodod-running-version-adoption'
import { readLocalFullVersion } from '../install/remote-versioned-install'

import { OPENKODOD_ACTIVATION_POLICY_REFUSED_CODE } from '../activation/openkodod-installed-activation'
import { pruneManagedOpenkododVersions } from './openkodod-managed-version-gc'
import { tunneledOpenkododPairingCode } from './openkodod-tunneled-pairing'
import { resolveOpenkododMigrationFence } from '../../ssh/migration-source/openkodod-migration-source-fence'
import type { SshTarget } from '../../../shared/remote-runtime/ssh/ssh-types'
import { findCollidingEnvironmentName } from '../../../shared/remote-runtime/host-catalog/runtime-environment-name-collision'
import { deployedOpenkododTunnelChecks } from './openkodod-managed-tunnel-identity'
import {
  isForceableOpenkododDeferral,
  managedOpenkododDeployPolicy,
  managedOpenkododSlot,
  probeManagedOpenkododReadiness,
  requireManagedOpenkododInfrastructure
} from './openkodod-managed-runtime-context'

export async function createManagedOpenkododEnvironment(
  userDataPath: string,
  args: {
    name: string
    sshTargetId: string
    force?: boolean
    signal?: AbortSignal
    migration?: boolean
  }
): Promise<OpenkododManagedDeployResult> {
  return runTargetLifecycle(args.sshTargetId, async () => {
    const { connectionManager, targetStore, claims } = requireManagedOpenkododInfrastructure()
    const environmentId =
      getManagedOpenkododFenceEnvironmentId(targetStore.getTarget(args.sshTargetId)) ?? randomUUID()
    // Duplicate/name checks before an add: a crash-zeroed list (#18766) must read as empty here.
    const environments = await listEnvironments(userDataPath, { recoverBlankStore: true })
    const registered = environments.find((entry) => entry.id === environmentId)
    if (registered) {
      assertRuntimeEnvironmentNotReconciling(registered)
      if (getOpenkododSshDeployment(registered)?.sshTargetId !== args.sshTargetId) {
        throw new Error('The SSH target is owned by a server that is not deployed on it.')
      }
    }
    const namesake = findCollidingEnvironmentName(
      environments.filter((entry) => entry.id !== environmentId),
      args.name
    )
    if (namesake) {
      throw new Error(`A server named "${namesake.name}" already exists.`)
    }
    const current = targetStore.getTarget(args.sshTargetId)
    if (args.migration) {
      assertMigrationFence(userDataPath, current, environmentId, args.name)
    }
    const claimed = claims.claim(args.sshTargetId, environmentId, {
      ...(args.migration ? {} : { deployName: args.name }),
      ownerRecorded:
        Boolean(args.migration) || Boolean(current?.openkododProvisioning) || Boolean(registered)
    })
    await claims.flush(args.signal)
    const targetGeneration = claimed.generation
    if (targetGeneration === undefined) {
      throw new Error(
        'The SSH registration for this host’s OpenKodo server has no durable generation.'
      )
    }
    if (
      registered &&
      getOpenkododSshDeployment(registered)?.sshTargetGeneration !== targetGeneration
    ) {
      throw new Error('The saved OpenKodo server for this host has a stale SSH target generation.')
    }
    let environmentRegistered = false
    try {
      const connection = await connectionManager.connect(claimed)
      let context = await resolveOpenkododRemoteContext(claimed, connection, args.signal)
      const slot = managedOpenkododSlot(context, OPENKODOD_MANAGED_REMOTE_PORT, args.signal)
      const recovery = await recoverInterruptedOpenkododActivation(slot)
      if (recovery.outcome === 'pending' || recovery.outcome === 'refused') {
        throw new Error(recovery.reason)
      }
      if (recovery.outcome === 'recovered') {
        context = { ...context, activationRecord: await readOpenkododActivationRecord(slot) }
      }
      if (registered) {
        environmentRegistered = true
        const current = await ensureOpenkododManagedTunnel(userDataPath, registered.id)
        const activeVersion = context.activationRecord.active
        if (!activeVersion) {
          throw new Error('This host’s OpenKodo server has no active runtime version.')
        }
        return {
          outcome: 'already-current',
          environment: redactRuntimeEnvironment(current),
          activeVersion
        }
      }
      const localOpenkododDir = await materializeOpenkododArtifact(context.serverTarget, {
        signal: args.signal
      })
      // Adopt before upload: only the paired incumbent can count terminals; redeploy would defer.
      const localVersion = readLocalFullVersion(localOpenkododDir)
      const adopted = args.force
        ? null
        : await adoptRunningOpenkododVersion(slot, context.activationRecord, localVersion)
      const { active } = context.activationRecord
      if (!adopted && !args.force && active && active !== localVersion) {
        // Wake may observe a peer's changed record; census admission must use that same record.
        context = { ...context, activationRecord: await readOpenkododActivationRecord(slot) }
      }
      const serving: DeployedOpenkodod | OpenkododManagedDeferral =
        adopted ??
        (await deployOwnOpenkodod(context, { ...slot, conn: connection }, localOpenkododDir, args))
      if ('outcome' in serving) {
        return serving
      }
      // Read the bound port: the preferred port may belong to another host process.
      const tunnel = deployedOpenkododTunnelChecks(serving.readiness, serving.reprobe)
      const localPort = await startOpenkododManagedTunnel(
        environmentId,
        claimed,
        connection,
        tunnel.remotePort,
        { ...tunnel, preferredPort: OPENKODOD_MANAGED_REMOTE_PORT }
      )
      const environment = await addManagedOpenkododEnvironment(userDataPath, {
        id: environmentId,
        name: args.name,
        pairingCode: tunneledOpenkododPairingCode(tunnel.readiness(), localPort),
        openkododDeployment: {
          sshTargetId: claimed.id,
          sshTargetGeneration: targetGeneration,
          localPort,
          remotePort: OPENKODOD_MANAGED_REMOTE_PORT
        }
      })
      environmentRegistered = true
      return {
        outcome: serving.created ? 'created' : 'already-current',
        environment: redactRuntimeEnvironment(environment),
        activeVersion: serving.version
      }
    } finally {
      if (!environmentRegistered) {
        await closeOpenkododManagedTunnel(environmentId).catch(() => undefined)
      }
    }
  })
}

type DeployedOpenkodod = OpenkododRunningAdoption & { created?: true }

async function deployOwnOpenkodod(
  context: OpenkododRemoteContext<SshTarget>,
  slot: ReturnType<typeof managedOpenkododSlot>,
  localOpenkododDir: string,
  args: { force?: boolean; signal?: AbortSignal }
): Promise<DeployedOpenkodod | OpenkododManagedDeferral> {
  const appVersion = getAppEnvironment().getVersion()
  const deployResult = await deployOpenkodod({
    ...slot,
    localOpenkododDir,
    target: context.serverTarget,
    ...managedOpenkododDeployPolicy(context, appVersion, args.force ? 'force' : 'connect'),
    force: args.force,
    appVersion
  })
  if (deployResult.outcome === 'installed-not-activated') {
    return {
      outcome: 'deferred',
      candidateVersion: deployResult.fullVersion,
      code: deployResult.code,
      reason: deployResult.reason,
      forceable:
        isForceableOpenkododDeferral(deployResult) ||
        deployResult.code === OPENKODOD_ACTIVATION_POLICY_REFUSED_CODE
    }
  }
  if (deployResult.outcome === 'already-active') {
    await wakeAlreadyActiveOpenkodod(slot)
  }
  const reprobe = () =>
    probeManagedOpenkododReadiness(
      context,
      localOpenkododDir,
      deployResult.fullVersion,
      args.signal
    )
  const readiness = await reprobe()
  await pruneManagedOpenkododVersions({
    slot,
    serverTarget: context.serverTarget,
    activeVersion: deployResult.fullVersion,
    readiness
  })
  return {
    version: deployResult.fullVersion,
    readiness,
    reprobe,
    ...(deployResult.outcome === 'already-active' ? {} : { created: true as const })
  }
}

function assertMigrationFence(
  userDataPath: string,
  target: SshTarget | undefined,
  environmentId: string,
  name: string
): void {
  const fence = target ? resolveOpenkododMigrationFence(userDataPath, target) : null
  if (
    fence?.state !== 'fenced' ||
    fence.cutover.destinationEnvironmentId !== environmentId ||
    fence.cutover.destinationName !== name
  ) {
    throw new Error('openkodod_migration_fence_required')
  }
}
