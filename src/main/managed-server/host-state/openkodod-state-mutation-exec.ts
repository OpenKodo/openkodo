// SSH channel closure does not prove host mutation exit; only command output or exit may release the activation fence.
import { OPENKODOD_STATE_MUTATION_DEADLINE_SECONDS } from './openkodod-state-snapshot'
import {
  OPENKODOD_STATE_MUTATION_BUSY,
  OPENKODOD_STATE_MUTATION_DEADLINE
} from './openkodod-state-snapshot-members'
import type { OpenkododRemoteExecTarget } from '../install/openkodod-remote-runtime-control'
import {
  execCommand,
  isUnconfirmedSshCommandTermination
} from '../../ssh/remote-exec/remote-exec-command'
import {
  isOpenkododFenceLost,
  OpenkododFenceLostError
} from '../activation/openkodod-activation-fence-scope'

// Let the host deadline kill workload before client observation times out.
export const OPENKODOD_STATE_MUTATION_CLIENT_TIMEOUT_MS =
  (OPENKODOD_STATE_MUTATION_DEADLINE_SECONDS + 60) * 1000

function unconfirmed(error: Error): Error & { sshChannelCloseConfirmed: false } {
  return Object.assign(error, { sshChannelCloseConfirmed: false as const })
}

/** Do not abort observation: caller cancellation cannot stop host-side mutation. */
export async function execOpenkododStateMutation(
  target: OpenkododRemoteExecTarget,
  command: string
): Promise<string> {
  let output: string
  try {
    output = await execCommand(target.conn, command, {
      wrapCommand: target.host.commandDialect !== 'powershell',
      timeoutMs: OPENKODOD_STATE_MUTATION_CLIENT_TIMEOUT_MS
    })
  } catch (error) {
    // Channel termination flags uncertainty; exit-status errors prove completion.
    if (error instanceof Error && 'sshChannelCloseConfirmed' in error) {
      throw unconfirmed(error)
    }
    throw isOpenkododFenceLost(error) ? new OpenkododFenceLostError() : error
  }
  const verdict = output.trim().split('\n').pop()?.trim()
  if (verdict === OPENKODOD_STATE_MUTATION_BUSY) {
    throw unconfirmed(
      new Error('Another snapshot capture or restore is still running on the host.')
    )
  }
  if (verdict === OPENKODOD_STATE_MUTATION_DEADLINE) {
    throw unconfirmed(
      new Error(
        `A snapshot capture or restore ran past ${OPENKODOD_STATE_MUTATION_DEADLINE_SECONDS}s and ` +
          'the host stopped it part way through.'
      )
    )
  }
  return output
}

/** Fall back only for finished failures; unconfirmed mutation remains fenced. */
export function execOpenkododStateMutationOr(
  target: OpenkododRemoteExecTarget,
  command: string,
  fallback = ''
): Promise<string> {
  return execOpenkododStateMutation(target, command).catch((error: unknown) => {
    // Lost ownership is a refusal, never a capture failure eligible for fallback.
    if (isUnconfirmedSshCommandTermination(error) || error instanceof OpenkododFenceLostError) {
      throw error
    }
    return fallback
  })
}
