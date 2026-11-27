import type { WslRunningDistrosRead } from '../discovery/wsl-background-distro-gate'
import { wslDistroHolderKey } from '../discovery/wsl-distro-holder-record'
import type { WslGuestIdentity } from '../execution/wsl-guest-process-identity'
import type { Trigger, WslOpenkododLivenessDependencies } from './wsl-openkodod-liveness-state'
import { nextWslLivenessProbe, type WslLivenessEvidence } from './wsl-openkodod-liveness-verdict'
import type { WslOpenkododWatch } from './wsl-openkodod-watch'

/** How long a failed exit waits before trusting a list that still shows its distro running. */
export const EXIT_SETTLE_MS = 500

export function failedExit(trigger: Trigger): boolean {
  return trigger !== 'heartbeat' && trigger.source !== 'verify' && trigger.code !== 0
}

export function confirmsRunning(running: WslRunningDistrosRead, key: string): boolean {
  return (
    running.status === 'confirmed' &&
    running.distros.some((candidate) => wslDistroHolderKey(candidate) === key)
  )
}

/** Asks only what the classifier still needs, in order: identity, then openkodod's port. */
export async function gatherWslLivenessEvidence(
  evidence: WslLivenessEvidence,
  probes: {
    readIdentity: () => Promise<WslGuestIdentity | null>
    probePort: () => Promise<WslOpenkododWatch['signal']>
  }
): Promise<WslLivenessEvidence> {
  for (let probe = nextWslLivenessProbe(evidence); probe; probe = nextWslLivenessProbe(evidence)) {
    if (probe === 'identity') {
      evidence.identity = await probes.readIdentity()
    } else {
      evidence.openkododPort = await probes.probePort()
    }
  }
  return evidence
}

/** Visible work relaunches an exited openkodod, unless it said it stopped idle: then it stays down
 *  until the user needs it, or the open desktop would undo every idle stop (#46567). */
export async function revives(
  deps: Pick<WslOpenkododLivenessDependencies, 'wasIdleStopped' | 'hasUserVisibleWork'>,
  distro: string
): Promise<boolean> {
  return !deps.wasIdleStopped?.(distro) && (await deps.hasUserVisibleWork(distro))
}
