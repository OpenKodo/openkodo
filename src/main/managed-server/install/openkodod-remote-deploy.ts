/** Activate under a durable host fence/journal only after candidate readiness. Recover the incumbent only with safe profile state; retain changed state/snapshot for explicit recovery. */
import { logOpenkododActivationOutcome } from '../activation/openkodod-activation-outcome-log'
import { join } from 'node:path'
import type { OpenkododHostTransport } from './openkodod-host-transport'
import type { OpenkododUpdateForce } from '../activation/openkodod-update-plan'
import { OPENKODOD_INSTALL_MODEL } from './remote-install-model'
import { computeRemoteInstallDir, readLocalFullVersion } from './remote-versioned-install'
import { readOpenkododActivationRecord } from '../activation/openkodod-activation-record-store'
import type { OpenkododActivationRecord } from '../activation/openkodod-activation-record'
import type { OpenkododActivationVerdict } from '../activation/openkodod-activation-gate'
import type { OpenkododTerminalCensus } from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-terminal-census'
import type { RemoteHostPlatform } from '../../ssh/remote-host/ssh-remote-platform'
import { installOpenkododBundle } from './openkodod-remote-install'
import type { InstallLockWait } from './remote-install-lock'
import { getAppEnvironment } from '../../../shared/app-lifecycle/app-environment'
import type { NodeRuntimeTarget } from '../../../shared/node-runtime/node-runtime-pin'
import { OPENKODOD_STARTUP_READINESS_TIMEOUT_MS } from '../../../shared/remote-runtime/openkodod-distribution/openkodod-profile-preflight'
import { materializeOpenkododArtifact } from '../../openkodod/artifact-slots/openkodod-artifact-materializer'
import { readOpenkododBundleTarget } from './openkodod-deployment-target'
import { resolveOpenkododRuntimeTarget } from '../lifecycle/openkodod-runtime-target'
import {
  openkododNodeRuntimeInstallOptions,
  type NodeRuntimeDownloadBudget
} from './openkodod-node-runtime-install-options'
import {
  openkododActivationFenceExists,
  resolveOpenkododActivationReadinessTimeout,
  withOpenkododActivationLock
} from '../activation/openkodod-activation-lock'
import { activateInstalledOpenkodod } from '../activation/openkodod-installed-activation'
import { openkododActivationFenceRefusal } from '../activation/openkodod-activation-fence-hold'

export type OpenkododDeployOptions = {
  conn: OpenkododHostTransport
  host: RemoteHostPlatform
  remoteHome: string
  /** An already assembled bundle; otherwise materialize the packaged template for this host. */
  localOpenkododDir?: string
  /** The bundle's runtime target; read from `localOpenkododDir` or probed when absent. */
  target?: NodeRuntimeTarget
  /** Where the pinned runtime archive is cached; defaults beside the openkodod artifact cache. */
  runtimeCacheRoot?: string
  nodePath: string
  userDataDir: string
  bindHost: string
  port: number
  /** Caller supplies a protocol-aware census; unanswered host evidence must never become zero live terminals. */
  census: OpenkododTerminalCensus
  /** Bind census to its incumbent record; a changed locked record makes earlier counts unverifiable. */
  censusRecord?: OpenkododActivationRecord
  /** WSL only: the record and fence this connect read moments ago; skips the same pre-upload reads. */
  preRead?: { record: OpenkododActivationRecord; fenceOpen: boolean }
  /** WSL only: a same-version deploy skips its fence; the caller's wake re-checks under its own. */
  sameVersionFencedByCaller?: boolean
  /** Recount under fence just before stopping the same incumbent; uploads may outdate initial counts and failures stay unverifiable. */
  recountCensus: () => Promise<OpenkododTerminalCensus>
  /** Best-effort reopen when incumbent keeps serving; admission also expires server-side. */
  releaseIncumbentAdmission: () => Promise<void>
  force?: OpenkododUpdateForce
  /** The OpenKodo app version activating, recorded so an older client never downgrades the host. */
  appVersion?: string
  /** Reapply version policy under lock because peer activation/stop may land during upload. */
  admitRecord?: (record: OpenkododActivationRecord, candidateVersion: string) => string | null
  readinessTimeoutMs?: number
  /** WSL only; SSH hosts always re-hash the runtime (see `installOpenkododBundle`). */
  recordedNodeRuntimeProbe?: boolean
  /** WSL only: bounded Node runtime downloads; SSH keeps the default timing. */
  nodeRuntimeDownload?: NodeRuntimeDownloadBudget
  /** WSL only: the host is a distro on this machine (see `installOpenkododBundle`). */
  localWslHost?: boolean
  /** Another install holds this version's lock; lets the UI say what the connect waits for. */
  onInstallLockWait?: (wait: InstallLockWait | null) => void
  now?: () => Date
  sleep?: (ms: number) => Promise<void>
  signal?: AbortSignal
}

export type OpenkododDeployResult =
  | { outcome: 'installed-and-activated'; fullVersion: string; verdict: OpenkododActivationVerdict }
  | { outcome: 'already-active'; fullVersion: string }
  | {
      outcome: 'installed-not-activated'
      fullVersion: string
      code: string
      reason: string
      /** The candidate's own preflight or launch check failed; a deferral never sets this. */
      startCheckFailed?: true
      /** This deploy uploaded the slot rather than finding it already installed. */
      freshlyInstalled?: true
      /** Full force may pass this uncounted-census deferral once the candidate proves no daemon. */
      forceable?: true
    }

export async function deployOpenkodod(
  input: OpenkododDeployOptions,
  retryClearedFence = true
): Promise<OpenkododDeployResult> {
  const target =
    input.target ??
    (input.localOpenkododDir
      ? readOpenkododBundleTarget(input.localOpenkododDir)
      : await resolveOpenkododRuntimeTarget(input))
  const runtimeCacheRoot =
    input.runtimeCacheRoot ?? join(getAppEnvironment().getPath('userData'), 'openkodod-artifacts')
  const options = {
    ...input,
    target,
    readinessTimeoutMs: resolveOpenkododActivationReadinessTimeout(
      input.readinessTimeoutMs,
      OPENKODOD_STARTUP_READINESS_TIMEOUT_MS
    ),
    ...openkododNodeRuntimeInstallOptions(target, runtimeCacheRoot, input),
    localOpenkododDir:
      input.localOpenkododDir ??
      (await materializeOpenkododArtifact(target, { signal: input.signal }))
  }
  const fullVersion = readLocalFullVersion(options.localOpenkododDir)
  const remoteDir = computeRemoteInstallDir(
    OPENKODOD_INSTALL_MODEL,
    options.remoteHome,
    fullVersion
  )
  const held = async (): Promise<OpenkododDeployResult> => {
    const { cleared, ...refusal } = await openkododActivationFenceRefusal(options, 'update')
    // Retry one cleared abandoned fence; repeated abandonment must surface to the caller.
    if (cleared && retryClearedFence) {
      return deployOpenkodod(
        {
          ...input,
          preRead: undefined,
          sameVersionFencedByCaller: undefined,
          target,
          localOpenkododDir: options.localOpenkododDir
        },
        false
      )
    }
    return { outcome: 'installed-not-activated', fullVersion, ...refusal }
  }
  // Refuse before upload, then re-read both admission inputs under fence.
  const preUploadRecord = options.preRead?.record ?? (await readOpenkododActivationRecord(options))
  const censusRecord = options.censusRecord ?? preUploadRecord
  // An unanswered probe only skips this shortcut; lock acquisition still arbitrates.
  if (
    !options.preRead?.fenceOpen &&
    (await openkododActivationFenceExists(options).catch(() => false))
  ) {
    return held()
  }

  const installed = await installOpenkododBundle(options, fullVersion, remoteDir)
  if (options.sameVersionFencedByCaller && preUploadRecord.active === fullVersion) {
    return { outcome: 'already-active', fullVersion }
  }

  const result = await logOpenkododActivationOutcome(
    `update to ${fullVersion}`,
    () =>
      withOpenkododActivationLock(
        options,
        (lock) =>
          activateInstalledOpenkodod({ ...options, censusRecord }, fullVersion, remoteDir, lock),
        held
      ),
    ['installed-and-activated', 'already-active']
  )
  return installed === 'uploaded' && result.outcome === 'installed-not-activated'
    ? { ...result, freshlyInstalled: true }
    : result
}
