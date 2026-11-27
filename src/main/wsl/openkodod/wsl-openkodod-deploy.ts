import type { WslHostDeferredUpdate } from '../../../shared/remote-runtime/wsl-hosts/wsl-host-types'
import type { WslOpenkododLaunch, WslOpenkododDeployOptions } from './wsl-openkodod-launch-contract'
/** D1/D2b/D8 reuse SSH installation, activation journals/fences and admission over wsl.exe. C5 pairs through the reported loopback port. */
import { getAppEnvironment } from '../../../shared/app-lifecycle/app-environment'

import { OPENKODOD_MANAGED_REMOTE_PORT } from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-managed-runtime'
import type { ServeReadiness } from '../../server/serve-readiness'

import { recoverInterruptedOpenkododActivation } from '../../managed-server/activation/openkodod-activation-recovery'
import { readOpenkododActivationRecord } from '../../managed-server/activation/openkodod-activation-record-store'
import { materializeOpenkododArtifact } from '../../openkodod/artifact-slots/openkodod-artifact-materializer'
import type { OpenkododHostTransport } from '../../managed-server/install/openkodod-host-transport'
import { OPENKODOD_ACTIVATION_POLICY_REFUSED_CODE } from '../../managed-server/activation/openkodod-installed-activation'
import { openkododBoundPort } from '../../managed-server/lifecycle/openkodod-managed-bound-port'
import {
  isForceableOpenkododDeferral,
  managedOpenkododDeployPolicy,
  managedOpenkododSlot
} from '../../managed-server/lifecycle/openkodod-managed-runtime-context'
import { isWaitingOpenkododUpdateDeferral } from '../../managed-server/lifecycle/openkodod-managed-auto-update'
import { clearOpenkododUpdateFailedThisLaunch } from '../../managed-server/lifecycle/openkodod-managed-update-failure-memory'
import type { OpenkododUpdateIntent } from '../../managed-server/lifecycle/openkodod-managed-update-decision'
import type { OpenkododActivationRecord } from '../../managed-server/activation/openkodod-activation-record'
import { errorMessage } from '../../../shared/errors/error-message'
import { pruneWslOpenkododVersionsUntilClean } from './wsl-openkodod-version-gc-memo'
import { pruneSupersededOpenkododCandidates } from '../../managed-server/lifecycle/openkodod-managed-version-gc'
import { wakeAlreadyActiveOpenkodod } from '../../managed-server/lifecycle/openkodod-already-active-wake'
import { OpenkododActiveReadinessError } from '../../managed-server/activation/openkodod-active-readiness'
import { WslDistroNotRunningError } from './wsl-openkodod-connection-errors'
import {
  deployOpenkodod,
  type OpenkododDeployOptions
} from '../../managed-server/install/openkodod-remote-deploy'
import { isWslMoveUnderwayOnHost } from '../../persistence/moving-wsl-projects/orchestration/wsl-move-running-moves'
import { readLocalFullVersion } from '../../managed-server/install/remote-versioned-install'
import { createWslDistroHolder } from '../discovery/wsl-distro-holder'

import { defaultWslOpenkododEnvironmentId } from './wsl-openkodod-environment-id'
import { readWslDistroRegistryIdShared } from '../discovery/wsl-distro-registry-id'
import type { WslOpenkododHostTarget } from './wsl-openkodod-host-target'
import { createWslOpenkododHostTransport } from './wsl-openkodod-host-transport'
import { holdWslDistroWithContext } from './wsl-openkodod-held-context'
import { deployWslOpenkododWithOneFence } from './wsl-openkodod-one-fence-deploy'
import { removeFailedFreshWslOpenkododInstall } from './wsl-openkodod-failed-install-removal'
import {
  probeWslActiveOpenkodod,
  readWslOpenkododPid,
  type WslOpenkododLaunchMode
} from './wsl-openkodod-active-probe'
import { relaunchAsWslHost } from './wsl-openkodod-host-relaunch'
import { wslOpenkododConnectStateHints } from './wsl-openkodod-connect-state-snapshot'
import { readWslOpenkododIncumbent, type WslOpenkododIncumbent } from './wsl-openkodod-incumbent'
import { adoptUnrecordedWslOpenkodod } from './wsl-openkodod-instance-adoption'
import {
  admitWslOpenkododLaunch,
  readRestoredWslOpenkododRecord,
  recordWslOpenkododUpdateFailure,
  wslOpenkododDeferralCode,
  wslOpenkododDeferralFailure
} from './wsl-openkodod-update-admission'
import { withOwnBuildLaunchEnv } from './wsl-openkodod-own-build-launch-env'
import { WSL_NODE_RUNTIME_DOWNLOAD_BUDGET } from '../execution/wsl-node-runtime-download-budget'

/** Until the persisted deployment record (C7) assigns one, the environment is keyed per distro. */
export { defaultWslOpenkododEnvironmentId }

export async function deployAndLaunchWslOpenkodod(
  distro: string,
  options: WslOpenkododDeployOptions = {}
): Promise<WslOpenkododLaunch> {
  const name = distro.trim()
  if (!name) {
    throw new Error('A WSL distro name is required')
  }
  const target: WslOpenkododHostTarget = {
    kind: 'wsl',
    id: options.environmentId ?? defaultWslOpenkododEnvironmentId(name),
    distro: name,
    label: options.label ?? name
  }
  const conn = options.createTransport?.(target) ?? createWslOpenkododHostTransport({ target })
  try {
    return await launchOverTransport(name, target, conn, options)
  } finally {
    conn.dispose?.()
  }
}

async function launchOverTransport(
  name: string,
  target: WslOpenkododHostTarget,
  transport: OpenkododHostTransport,
  options: WslOpenkododDeployOptions
): Promise<WslOpenkododLaunch> {
  const { signal } = options
  let ownBuildVersion: string | null = null
  // Set by the serving probe; readyLaunch reads the pid itself for any other version.
  let probed: { fullVersion: string; pid: number | null } | null = null
  const conn = withOwnBuildLaunchEnv(transport, () => ownBuildVersion)
  // Acquire a holder before launch or WSL can idle-stop openkodod's distro.
  const holder = options.holder ?? createWslDistroHolder({ userDataPath: userDataPath() })
  // Read GUID alongside deploy; failure leaves the record without one.
  const distroId = (options.readRegistryId ?? readWslDistroRegistryIdShared)(name).catch(() => null)
  options.onStage?.('starting-distro')
  const first = await holdWslDistroWithContext(name, target, conn, holder, signal)
  const { held, connectState } = first
  let context = first.context
  const hints = wslOpenkododConnectStateHints(connectState, context.activationRecord)
  const slot = managedOpenkododSlot(context, OPENKODOD_MANAGED_REMOTE_PORT, signal)
  const recovery = await recoverInterruptedOpenkododActivation(slot, connectState ?? undefined)
  if (recovery.outcome === 'pending' || recovery.outcome === 'refused') {
    throw new Error(recovery.reason)
  }
  if (recovery.outcome === 'recovered') {
    context = { ...context, activationRecord: await readOpenkododActivationRecord(slot) }
  }
  // Adopt unrecorded openkodod before deploy/wake or its instance lock blocks launch.
  const adoption = await adoptUnrecordedWslOpenkodod(
    slot,
    context.activationRecord,
    undefined,
    hints.instanceLock(context.activationRecord)
  )
  if (adoption.outcome === 'adopted') {
    context = { ...context, activationRecord: adoption.record }
  }
  options.onStage?.('installing-server')
  const localOpenkododDir = await materializeOpenkododArtifact(context.serverTarget, {
    signal,
    trustVerificationRecord: true,
    ...(options.templateDir ? { templateDir: options.templateDir } : {})
  })
  const appVersion = getAppEnvironment().getVersion()
  const candidateVersion = readLocalFullVersion(localOpenkododDir)
  ownBuildVersion = candidateVersion
  const failureHost = { kind: 'wsl', id: target.id } as const
  const intent = options.intent ?? 'connect'
  const admit = (record: OpenkododActivationRecord, admitIntent: OpenkododUpdateIntent) =>
    admitWslOpenkododLaunch(
      {
        slot,
        record,
        candidateVersion,
        appVersion,
        host: failureHost,
        intent: admitIntent,
        moveRunning: isWslMoveUnderwayOnHost(userDataPath(), name)
      },
      name,
      readyLaunch
    )
  const admitted = await admit(context.activationRecord, intent)
  if ('outcome' in admitted) {
    return admitted
  }
  context = { ...context, activationRecord: admitted }
  const incumbentVersion = context.activationRecord.active
  // Only version changes need incumbent census; same-version connects deploy as no-ops.
  const incumbent: WslOpenkododIncumbent | null =
    incumbentVersion && incumbentVersion !== candidateVersion
      ? await (options.readIncumbent ?? readWslOpenkododIncumbent)({
          context,
          slot,
          paired: options.pairedOffer ?? null
        })
      : null
  const deployOnce = (extra: Partial<OpenkododDeployOptions>) =>
    deployOpenkodod({
      ...slot,
      conn,
      localOpenkododDir,
      target: context.serverTarget,
      ...managedOpenkododDeployPolicy(context, appVersion, intent, options.pastUncountedTerminals),
      ...(incumbent
        ? {
            census: incumbent.census,
            recountCensus: incumbent.recount,
            releaseIncumbentAdmission: incumbent.releaseAdmission
          }
        : {}),
      // Only a confirmed Update anyway passes an uncounted census; plain Force defers it back to that confirm.
      force: options.pastUncountedTerminals ? true : intent === 'force' && 'live-terminals',
      appVersion,
      recordedNodeRuntimeProbe: true,
      localWslHost: true,
      nodeRuntimeDownload: WSL_NODE_RUNTIME_DOWNLOAD_BUDGET,
      onInstallLockWait: options.onInstallLockWait,
      ...extra
    }).catch((error: unknown) => {
      if (!signal?.aborted) {
        recordWslOpenkododUpdateFailure(failureHost, incumbentVersion, {
          code: 'openkodod_update_failed',
          reason: errorMessage(error)
        })
      }
      throw error
    })
  const { deployed, woken } = await deployWslOpenkododWithOneFence(
    slot,
    deployOnce,
    hints.deployPreRead(context.activationRecord)
  )
  if (deployed.outcome === 'installed-not-activated') {
    await removeFailedFreshWslOpenkododInstall(slot, deployed)
    const failure = wslOpenkododDeferralFailure(deployed)
    recordWslOpenkododUpdateFailure(failureHost, incumbentVersion, failure)
    const restored =
      incumbentVersion && failure
        ? await readRestoredWslOpenkododRecord(slot, incumbentVersion)
        : null
    if (restored) {
      // After rollback proof, serve the restored incumbent on this connect too.
      const retried = await admit(restored, 'connect')
      if ('outcome' in retried) {
        return retried
      }
    }
    const deferredUpdate: WslHostDeferredUpdate = {
      candidateVersion: deployed.fullVersion,
      code: await wslOpenkododDeferralCode(slot, deployed, appVersion),
      reason: deployed.reason,
      incumbentVersion,
      forceable:
        isForceableOpenkododDeferral(deployed) ||
        deployed.code === OPENKODOD_ACTIVATION_POLICY_REFUSED_CODE
    }
    // Live-terminal deferrals keep the incumbent serving until Update/Force.
    if (
      incumbentVersion &&
      incumbent?.readiness &&
      isWaitingOpenkododUpdateDeferral(deployed.code) &&
      // Another client may have activated since census; refuse stale incumbent assumptions.
      (await readOpenkododActivationRecord(slot)).active === incumbentVersion
    ) {
      const serving = {
        fullVersion: incumbentVersion,
        readiness: incumbent.readiness
      }
      await pruneSupersededOpenkododCandidates(slot, context.serverTarget, deployed.fullVersion)
      return { ...(await readyLaunch(serving)), deferredUpdate }
    }
    return { outcome: 'deferred', distro: name, ...deferredUpdate }
  }
  clearOpenkododUpdateFailedThisLaunch(failureHost)
  options.onStage?.('connecting')
  // A holder, not a let: control flow would not see the probe closure set it.
  const launch: { mode: WslOpenkododLaunchMode } = { mode: 'unknown' }
  const probe = async () => {
    const answer = await probeWslActiveOpenkodod(
      context,
      localOpenkododDir,
      deployed.fullVersion,
      signal
    )
    probed = { fullVersion: deployed.fullVersion, pid: answer.pid }
    launch.mode = answer.launch
    return answer.readiness
  }
  let notWslHost: WslHostDeferredUpdate | null = null
  let readiness: ServeReadiness
  if (deployed.outcome === 'already-active') {
    // A stopped distro ended the active slot with it; the one-fence deploy already woke it.
    await (woken ? null : wakeAlreadyActiveOpenkodod(slot))
    // Why once more: on a distro still booting, the openkodod the wake saw serving can exit before
    // the probe; that is a stopped slot to start, not a failed connect.
    readiness = await probe().catch(async (error: unknown) => {
      if (!(error instanceof OpenkododActiveReadinessError) || error.verdict !== 'exited') {
        throw error
      }
      // A `wsl --shutdown` during a no-boot connect must not be undone by this second wake.
      if (options.requireRunning && !(await options.requireRunning())) {
        throw new WslDistroNotRunningError(name)
      }
      await wakeAlreadyActiveOpenkodod(slot)
      return probe()
    })
    // Started without the WSL host marker (#43632): restart it as one when no terminal or chat runs.
    if (launch.mode === 'other') {
      const relaunch = await relaunchAsWslHost({
        environmentId: target.id,
        context,
        slot,
        fullVersion: deployed.fullVersion,
        paired: options.pairedOffer ?? null,
        moveRunning: isWslMoveUnderwayOnHost(userDataPath(), name),
        readIncumbent: options.readIncumbent,
        reprobe: async () => ({ readiness: await probe(), launch: launch.mode })
      })
      if (!relaunch.ready) {
        return { outcome: 'deferred', distro: name, ...relaunch.deferredUpdate }
      }
      readiness = relaunch.readiness ?? readiness
      notWslHost = relaunch.deferredUpdate
    }
  } else {
    readiness = await probe()
  }
  await pruneWslOpenkododVersionsUntilClean(target.id, {
    slot,
    serverTarget: context.serverTarget,
    activeVersion: deployed.fullVersion,
    readiness
  })
  const ready = await readyLaunch({ fullVersion: deployed.fullVersion, readiness })
  return notWslHost ? { ...ready, deferredUpdate: notWslHost } : ready

  async function readyLaunch(serving: {
    fullVersion: string
    readiness: ServeReadiness
  }): Promise<Extract<WslOpenkododLaunch, { outcome: 'ready' }>> {
    // The serving probe already read it; an admission that serves an incumbent did not.
    const pid =
      probed?.fullVersion === serving.fullVersion
        ? probed.pid
        : await readWslOpenkododPid(context, serving.fullVersion, signal)
    return {
      outcome: 'ready',
      distro: name,
      distroId: await distroId,
      port: openkododBoundPort(serving.readiness) ?? OPENKODOD_MANAGED_REMOTE_PORT,
      fullVersion: serving.fullVersion,
      pid,
      readiness: serving.readiness,
      holder: held.outcome,
      ...(adoption.outcome === 'adopted'
        ? { adoptedInstance: { version: adoption.version, pid: adoption.pid } }
        : {})
    }
  }
}

function userDataPath(): string {
  return getAppEnvironment().getPath('userData')
}
