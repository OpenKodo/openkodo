import type { KnownRuntimeEnvironment } from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import { resolveEnvironment } from '../../../shared/remote-runtime/host-store/runtime-environment-store'
import type { SshTarget } from '../../../shared/remote-runtime/ssh/ssh-types'
import type { SshConnection } from '../../ssh/connection/ssh-connection'
import { probeManagedOpenkododTunnel } from './openkodod-managed-tunnel-resume'
import {
  ensureManagedOpenkododServing,
  forgetManagedOpenkododServingVerdict
} from './openkodod-managed-serving'
import { getManagedOpenkododCrashLoopBrake } from './openkodod-managed-crash-loop'
import { OpenkododManagedTunnelManager } from './openkodod-managed-tunnel-manager'
import { buildOnBindableLocalPort } from './openkodod-managed-tunnel-local-port'
import { getRemoteRuntimeSharedControlAnsweredAt } from '../../ipc/runtime-environments/connections/runtime-environment-shared-control-answers'
import {
  getSshConnectionManager,
  getSshTargetRegistryStore
} from '../../ssh/targets/ssh-target-registry'
import {
  MANAGED_OPENKODOD_TUNNEL_TARGETING,
  type OpenkododTunnelStartChecks
} from './openkodod-managed-tunnel-target'
import {
  liveManagedOpenkododPairingRepairDeps,
  ManagedOpenkododPairingRepairs,
  pairingRevisionOf
} from './openkodod-managed-pairing-repair'
import {
  buildWithPairingRepair,
  type ManagedOpenkododPairingRecovery
} from './openkodod-managed-tunnel-pairing-recovery'

const managedTunnels = new OpenkododManagedTunnelManager({
  getConnectionManager: getSshConnectionManager,
  getTargetStore: getSshTargetRegistryStore,
  targeting: MANAGED_OPENKODOD_TUNNEL_TARGETING,
  ensureServing: (input) =>
    ensureManagedOpenkododServing({
      ...input,
      probe: probeManagedOpenkododTunnel,
      answeredAt: getRemoteRuntimeSharedControlAnsweredAt
    })
})

const pairingRepairs = new Map<string, ManagedOpenkododPairingRepairs>()

function pairingRecovery(userDataPath: string): ManagedOpenkododPairingRecovery {
  let repairs = pairingRepairs.get(userDataPath)
  if (!repairs) {
    repairs = new ManagedOpenkododPairingRepairs(
      liveManagedOpenkododPairingRepairDeps(userDataPath)
    )
    pairingRepairs.set(userDataPath, repairs)
  }
  return {
    resolve: async (environmentId) => await resolveEnvironment(userDataPath, environmentId),
    repairs,
    ensure: (environment) =>
      managedTunnels.ensure(
        environment,
        async () => await resolveEnvironmentOrNull(userDataPath, environment.id)
      )
  }
}

/** Return stored credentials: tunnel repair may have replaced the pairing. */
export async function ensureOpenkododManagedTunnel(
  userDataPath: string,
  selector: string
): Promise<KnownRuntimeEnvironment> {
  const { id } = await resolveEnvironment(userDataPath, selector)
  await buildOnBindableLocalPort(userDataPath, id, () =>
    buildWithPairingRepair(pairingRecovery(userDataPath), id, (environment) =>
      managedTunnels.ensure(
        environment,
        async () => await resolveEnvironmentOrNull(userDataPath, id)
      )
    )
  )
  return await resolveEnvironment(userDataPath, id)
}

export async function rebuildOpenkododManagedTunnel(
  userDataPath: string,
  selector: string
): Promise<'built' | 'repaired'> {
  const { id } = await resolveEnvironment(userDataPath, selector)
  return buildOnBindableLocalPort(userDataPath, id, () =>
    buildWithPairingRepair(pairingRecovery(userDataPath), id, (environment) =>
      managedTunnels.rebuild(
        environment,
        async () => await resolveEnvironmentOrNull(userDataPath, id)
      )
    )
  )
}

/** Reprove pinned-server refusal before repair; foreign servers must fail identity validation. */
export function recoverRefusedManagedOpenkododPairing(
  userDataPath: string,
  environmentId: string
): Promise<'built' | 'repaired'> {
  return rebuildOpenkododManagedTunnel(userDataPath, environmentId)
}

/** Ignore failures belonging to older pairing revisions. */
export async function managedOpenkododPairingFailureStands(
  userDataPath: string,
  environmentId: string
): Promise<boolean> {
  const environment = await resolveEnvironmentOrNull(userDataPath, environmentId)
  return (
    environment !== null &&
    (pairingRepairs
      .get(userDataPath)
      ?.standingFailure(environmentId, pairingRevisionOf(environment)) ?? null) !== null
  )
}

/** Explicit connect clears recent repair failures and re-arms automatic starts. */
export function forgetManagedOpenkododAutomaticFailures(
  userDataPath: string,
  environmentId: string
): void {
  pairingRepairs.get(userDataPath)?.forgetFailures(environmentId)
  getManagedOpenkododCrashLoopBrake().forget(environmentId)
  forgetManagedOpenkododServingVerdict(environmentId)
}

async function resolveEnvironmentOrNull(userDataPath: string, id: string) {
  try {
    return await resolveEnvironment(userDataPath, id)
  } catch {
    return null
  }
}

export function verifyManagedTunnelServing(environment: KnownRuntimeEnvironment) {
  return managedTunnels.verifyServing(environment)
}

export function disposeOpenkododManagedTunnels(): void {
  managedTunnels.dispose()
}

// System SSH forwards have independent processes and can outlive OpenKodo.
export function shutdownOpenkododManagedTunnels(): Promise<void> {
  return managedTunnels.shutdown()
}

export function recoverOpenkododManagedTunnelsAfterHostResume(
  userDataPath: string,
  options: { attempts: number; timeoutMs: number }
): Promise<void> {
  return managedTunnels.recoverAfterHostResume({
    ...options,
    resolveEnvironment: async (environmentId) =>
      await resolveEnvironmentOrNull(userDataPath, environmentId)
  })
}

export function startOpenkododManagedTunnel(
  environmentId: string,
  target: SshTarget,
  connection: SshConnection,
  remotePort: number,
  checks?: OpenkododTunnelStartChecks
): Promise<number> {
  return managedTunnels.start(environmentId, target, connection, remotePort, checks)
}

export function closeOpenkododManagedTunnel(environmentId: string): Promise<void> {
  return managedTunnels.close(environmentId)
}

export function closeOpenkododManagedTunnelsForTarget(targetId: string): Promise<void> {
  return managedTunnels.closeTarget(targetId)
}
