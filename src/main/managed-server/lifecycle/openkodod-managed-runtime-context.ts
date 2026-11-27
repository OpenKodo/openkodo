import { resolveEnvironment } from '../../../shared/remote-runtime/host-store/runtime-environment-store'
import {
  isOpenkododUncountedTerminalsDeferral,
  OPENKODOD_UPDATE_TERMINALS_RUNNING_CODE
} from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-managed-runtime'
import {
  getOpenkododSshDeployment,
  type KnownRuntimeEnvironment,
  type OpenkododSshDeploymentLink
} from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import { getManagedOpenkododFenceEnvironmentId } from '../../../shared/remote-runtime/ssh/managed-openkodod-ssh-owner'
import type { ServeReadiness } from '../../server/serve-readiness'
import { computeLocalOpenkododBuildHash } from '../install/openkodod-local-build-hash'

import type { OpenkododHostTarget } from '../install/openkodod-host-transport'
import type { OpenkododActivationRecord } from '../activation/openkodod-activation-record'
import {
  admitConfirmedIncumbent,
  admitOpenkododRecordForIntent,
  type OpenkododUpdateIntent
} from './openkodod-managed-update-decision'
import {
  type OpenkododTerminalCensus,
  UNVERIFIABLE_OPENKODOD_TERMINAL_CENSUS
} from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-terminal-census'
import { probeActiveOpenkododReadiness } from '../activation/openkodod-active-readiness'
import {
  resolveOpenkododRemoteContext,
  type OpenkododRemoteContext
} from '../install/openkodod-remote-context'
import { OPENKODOD_INSTALL_MODEL } from '../install/remote-install-model'
import { computeRemoteInstallDir } from '../install/remote-versioned-install'
import {
  getSshConnectionManager,
  getSshTargetRegistryStore
} from '../../ssh/targets/ssh-target-registry'

const OPENKODOD_BIND_HOST = '127.0.0.1'

// Pinned slots must fail on absent markers rather than silently use host Node.
const MANAGED_OPENKODOD_LEGACY_NODE_PATH = ''

export function requireManagedOpenkododInfrastructure() {
  const targetStore = requireManagedOpenkododTargetStore()
  const connectionManager = getSshConnectionManager()
  if (!connectionManager) {
    throw new Error(
      'SSH is unavailable on this client; this host’s OpenKodo server is unverifiable.'
    )
  }
  return { connectionManager, targetStore, claims: targetStore.getOpenkododRuntimeClaims() }
}

export function requireManagedOpenkododTargetStore() {
  const targetStore = getSshTargetRegistryStore()
  if (!targetStore) {
    throw new Error('SSH target state is unavailable; this host’s OpenKodo server is unverifiable.')
  }
  return targetStore
}

export async function requireManagedOpenkododEnvironment(
  userDataPath: string,
  selector: string
): Promise<{ environment: KnownRuntimeEnvironment; deployment: OpenkododSshDeploymentLink }> {
  const environment = await resolveEnvironment(userDataPath, selector)
  const deployment = getOpenkododSshDeployment(environment)
  if (!deployment || environment.connectionDependency !== 'ssh-tunnel') {
    throw new Error('This server is not managed through an openkodod SSH deployment.')
  }
  return { environment, deployment }
}

export async function resolveLinkedOpenkododContext(
  environment: KnownRuntimeEnvironment,
  deployment: OpenkododSshDeploymentLink,
  signal?: AbortSignal
): Promise<OpenkododRemoteContext> {
  const { connectionManager, targetStore } = requireManagedOpenkododInfrastructure()
  const target = targetStore.getTarget(deployment.sshTargetId)
  if (
    !target ||
    target.generation !== deployment.sshTargetGeneration ||
    getManagedOpenkododFenceEnvironmentId(target) !== environment.id
  ) {
    throw new Error('The SSH registration for this host’s OpenKodo server is no longer valid.')
  }
  const connection = await connectionManager.connect(target)
  return resolveOpenkododRemoteContext(target, connection, signal)
}

export function managedOpenkododSlot(
  context: OpenkododRemoteContext<OpenkododHostTarget>,
  port: number,
  signal?: AbortSignal
) {
  return {
    conn: context.connection,
    host: context.host,
    remoteHome: context.remoteHome,
    nodePath: MANAGED_OPENKODOD_LEGACY_NODE_PATH,
    userDataDir: context.userDataDir,
    bindHost: OPENKODOD_BIND_HOST,
    port,
    signal
  }
}

export function managedOpenkododInstallDir(
  context: OpenkododRemoteContext<OpenkododHostTarget>,
  version: string
): string {
  return computeRemoteInstallDir(
    OPENKODOD_INSTALL_MODEL,
    context.remoteHome,
    version,
    context.host.pathFlavor
  )
}

/** Accept readiness only from the build this client holds. */
export function probeManagedOpenkododReadiness(
  context: OpenkododRemoteContext<OpenkododHostTarget>,
  localOpenkododDir: string,
  fullVersion: string,
  signal?: AbortSignal
): Promise<ServeReadiness> {
  return probeActiveOpenkododReadiness(
    {
      conn: context.connection,
      host: context.host,
      remoteInstallDir: managedOpenkododInstallDir(context, fullVersion),
      signal
    },
    { buildHash: computeLocalOpenkododBuildHash(localOpenkododDir), fullVersion }
  )
}

export function managedOpenkododDeployPolicy(
  context: Pick<OpenkododRemoteContext<OpenkododHostTarget>, 'activationRecord'>,
  appVersion: string,
  intent: OpenkododUpdateIntent,
  /** Update anyway's confirmed incumbent: a build activated since then is refused. */
  confirmed?: { incumbentVersion: string | null }
): {
  census: OpenkododTerminalCensus
  recountCensus: () => Promise<OpenkododTerminalCensus>
  releaseIncumbentAdmission: () => Promise<void>
  censusRecord: OpenkododActivationRecord
  admitRecord: (record: OpenkododActivationRecord, candidateVersion: string) => string | null
} {
  // Only the active daemon can count sessions; guessing zero risks restarting live terminals.
  const census: OpenkododTerminalCensus = context.activationRecord.active
    ? UNVERIFIABLE_OPENKODOD_TERMINAL_CENSUS
    : { liveSessions: 0, startedSinceActivation: 0, daemonProtocolVersion: null }
  return {
    census,
    recountCensus: async () => census,
    releaseIncumbentAdmission: async () => {},
    censusRecord: context.activationRecord,
    // Only the fenced read can reject newer migrated state or rolled-back builds on this unlinked path.
    admitRecord: confirmed
      ? admitConfirmedIncumbent(
          admitOpenkododRecordForIntent(intent, appVersion),
          confirmed.incumbentVersion
        )
      : admitOpenkododRecordForIntent(intent, appVersion)
  }
}

// Force can override live terminal counts, and an answered uncounted census once the planner proves no daemon is running.
export function isForceableOpenkododDeferral(deferral: {
  code: string
  forceable?: true
}): boolean {
  return (
    deferral.code === OPENKODOD_UPDATE_TERMINALS_RUNNING_CODE ||
    (deferral.forceable === true && isOpenkododUncountedTerminalsDeferral(deferral.code))
  )
}
