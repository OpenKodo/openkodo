import { getAppEnvironment } from '../../../shared/app-lifecycle/app-environment'
import { redactRuntimeEnvironment } from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import type {
  OpenkododManagedDeployResult,
  OpenkododManagedPastLiveTerminals
} from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-managed-runtime'

import { materializeOpenkododArtifact } from '../../openkodod/artifact-slots/openkodod-artifact-materializer'
import { wakeAlreadyActiveOpenkodod } from './openkodod-already-active-wake'
import {
  clearManagedOpenkododUpdateDeferral,
  recordManagedOpenkododUpdateDeferral
} from './openkodod-managed-update-deferrals'

import {
  isForceableOpenkododDeferral,
  managedOpenkododSlot,
  probeManagedOpenkododReadiness,
  resolveLinkedOpenkododContext
} from './openkodod-managed-runtime-context'

import type { requireManagedOpenkododEnvironment } from './openkodod-managed-runtime-context'

import type { OpenkododRemoteContext } from '../install/openkodod-remote-context'
import { deployOpenkodod } from '../install/openkodod-remote-deploy'
import type { OpenkododDeployOptions } from '../install/openkodod-remote-deploy'
import type { OpenkododUpdateForce } from '../activation/openkodod-update-plan'
import { OPENKODOD_ACTIVATION_POLICY_REFUSED_CODE } from '../activation/openkodod-installed-activation'
import {
  pruneManagedOpenkododVersions,
  pruneSupersededOpenkododCandidates
} from './openkodod-managed-version-gc'

import { clearOpenkododUpdateFailedThisLaunch } from './openkodod-managed-update-failure-memory'
import {
  admitConfirmedIncumbent,
  admitOpenkododRecordForIntent,
  managedOpenkododUpdateForce
} from './openkodod-managed-update-decision'
import { collectManagedTerminalCensus } from './openkodod-terminal-census-client'
import { updateTerminalCounts } from '../activation/openkodod-fenced-stop'
import { refreshMaintainedOpenkododPairing } from './openkodod-maintenance-pairing-refresh'
import type { LifecycleArgs } from './openkodod-managed-lifecycle'
import {
  withManagedOpenkododLifecycle,
  followLaunchedServerPort
} from './openkodod-managed-lifecycle'

export async function updateManagedOpenkododEnvironment(
  userDataPath: string,
  args: LifecycleArgs & {
    force?: boolean
    pastLiveTerminals?: OpenkododManagedPastLiveTerminals
    endInProcessTerminals?: boolean
  }
): Promise<OpenkododManagedDeployResult> {
  const { pastLiveTerminals } = args
  // Update anyway keeps Update's version admission even if a caller also passed force.
  const intent = args.force && !pastLiveTerminals ? 'force' : 'update'
  return await withManagedOpenkododLifecycle(userDataPath, args.selector, async (managed) => {
    const admitIntent = admitOpenkododRecordForIntent(intent, getAppEnvironment().getVersion())
    // Checked under the host fence: another desktop may have activated a build since the confirm.
    const admitRecord: NonNullable<OpenkododDeployOptions['admitRecord']> = pastLiveTerminals
      ? admitConfirmedIncumbent(admitIntent, pastLiveTerminals.incumbentVersion)
      : admitIntent
    // A confirmed uncounted census needs full force, which still requires proof no daemon is running.
    const force = managedOpenkododUpdateForce(args)
    const result = await runManagedOpenkododUpdate(
      userDataPath,
      managed,
      await resolveLinkedOpenkododContext(managed.environment, managed.deployment, args.signal),
      { signal: args.signal, force, admitRecord }
    )
    // A completed manual update clears automatic failure suppression; deferred attempts do not.
    if (result.outcome !== 'deferred') {
      clearOpenkododUpdateFailedThisLaunch({ kind: 'ssh', id: managed.deployment.sshTargetId })
    }
    return result
  })
}

export async function runManagedOpenkododUpdate(
  userDataPath: string,
  { environment, deployment }: Awaited<ReturnType<typeof requireManagedOpenkododEnvironment>>,
  context: OpenkododRemoteContext,
  args: {
    force?: OpenkododUpdateForce
    signal?: AbortSignal
    localOpenkododDir?: string
    admitRecord?: OpenkododDeployOptions['admitRecord']
  }
): Promise<OpenkododManagedDeployResult> {
  const { countFirst, ...recount } = updateTerminalCounts((options) =>
    collectManagedTerminalCensus(
      userDataPath,
      environment,
      context.activationRecord,
      undefined,
      options
    )
  )
  const census = await countFirst()
  const localOpenkododDir =
    args.localOpenkododDir ??
    (await materializeOpenkododArtifact(context.serverTarget, { signal: args.signal }))
  const slot = managedOpenkododSlot(context, deployment.remotePort, args.signal)
  const result = await deployOpenkodod({
    ...slot,
    localOpenkododDir,
    target: context.serverTarget,
    census,
    ...recount,
    censusRecord: context.activationRecord,
    force: args.force,
    appVersion: getAppEnvironment().getVersion(),
    ...(args.admitRecord ? { admitRecord: args.admitRecord } : {})
  })
  if (result.outcome === 'installed-not-activated') {
    const deferral = {
      outcome: 'deferred' as const,
      candidateVersion: result.fullVersion,
      code: result.code,
      reason: result.reason,
      // Force may override policy deferrals, including a newer host build.
      forceable:
        isForceableOpenkododDeferral(result) ||
        result.code === OPENKODOD_ACTIVATION_POLICY_REFUSED_CODE
    }
    // Policy refusal is final for this host, not a transient update to retry.
    if (result.code !== OPENKODOD_ACTIVATION_POLICY_REFUSED_CODE) {
      recordManagedOpenkododUpdateDeferral(environment.id, deferral, context.activationRecord)
    }
    await pruneSupersededOpenkododCandidates(slot, context.serverTarget, result.fullVersion)
    return deferral
  }
  clearManagedOpenkododUpdateDeferral(environment.id)
  const alreadyActive = result.outcome === 'already-active'
  const managed = { environmentId: environment.id, hostLabel: context.target.label }
  const started = alreadyActive && (await wakeAlreadyActiveOpenkodod(slot, managed))
  const readiness = await probeManagedOpenkododReadiness(
    context,
    localOpenkododDir,
    result.fullVersion,
    args.signal
  )
  await pruneManagedOpenkododVersions({
    slot,
    serverTarget: context.serverTarget,
    activeVersion: result.fullVersion,
    readiness
  })
  const updated = await refreshMaintainedOpenkododPairing(userDataPath, environment.id, readiness)
  if (started || result.outcome !== 'already-active') {
    await followLaunchedServerPort(userDataPath, environment.id)
  }
  return {
    outcome: result.outcome === 'already-active' ? 'already-current' : 'updated',
    environment: redactRuntimeEnvironment(updated),
    activeVersion: result.fullVersion
  }
}
