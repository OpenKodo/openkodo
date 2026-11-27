// Rollback restores a pre-activation snapshot: older builds may not understand newer state.
// Stop, rescue, restore, then launch; the rescue and fenced journal allow recovery of interrupted steps.
import { logOpenkododActivationOutcome } from '../activation/openkodod-activation-outcome-log'
import type { OpenkododHostTransport } from './openkodod-host-transport'
import type { OpenkododActivationRecord } from '../activation/openkodod-activation-record'
import type { OpenkododTerminalCensus } from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-terminal-census'
import type { OpenkododActivationVerdict } from '../activation/openkodod-activation-gate'
import type { OpenkododDaemonProtocolFacts } from '../activation/openkodod-daemon-protocol-crossing'
import { readOpenkododActivationRecord } from '../activation/openkodod-activation-record-store'
import { sameOpenkododActivationRecord } from '../activation/openkodod-activation-transaction'
import type { RemoteHostPlatform } from '../../ssh/remote-host/ssh-remote-platform'
import {
  resolveOpenkododActivationReadinessTimeout,
  withOpenkododActivationLock
} from '../activation/openkodod-activation-lock'
import { openkododActivationFenceRefusal } from '../activation/openkodod-activation-fence-hold'
import { OPENKODOD_STARTUP_READINESS_TIMEOUT_MS } from '../../../shared/remote-runtime/openkodod-distribution/openkodod-profile-preflight'
import { rollbackOpenkododLocked } from '../lifecycle/openkodod-rollback-transition'

export type OpenkododRollbackOptions = {
  conn: OpenkododHostTransport
  host: RemoteHostPlatform
  remoteHome: string
  record: OpenkododActivationRecord
  nodePath: string
  userDataDir: string
  bindHost: string
  port: number
  census: OpenkododTerminalCensus
  /** Close terminal admission, then recount under the host lock; any failure is unverifiable. */
  recountCensus: () => Promise<OpenkododTerminalCensus>
  /** Reopen admission if rollback leaves the incumbent serving. */
  releaseIncumbentAdmission: () => Promise<void>
  /** Expected hash from the client's copy of the rollback target. */
  targetBuildHash: string
  /** Protocol facts from the same target bytes. */
  targetDaemonProtocol: OpenkododDaemonProtocolFacts
  readinessTimeoutMs?: number
  now?: () => Date
  sleep?: (ms: number) => Promise<void>
  signal?: AbortSignal
}

export type OpenkododRollbackResult =
  | {
      outcome: 'rolled-back'
      target: string
      discarded: string[]
      verdict: OpenkododActivationVerdict
    }
  | { outcome: 'refused'; code: string; reason: string }
  | { outcome: 'failed'; code: string; reason: string }

export async function rollbackOpenkodod(
  input: OpenkododRollbackOptions
): Promise<OpenkododRollbackResult> {
  const options = {
    ...input,
    readinessTimeoutMs: resolveOpenkododActivationReadinessTimeout(
      input.readinessTimeoutMs,
      OPENKODOD_STARTUP_READINESS_TIMEOUT_MS
    )
  }
  return logOpenkododActivationOutcome(
    `rollback to ${options.record.previous ?? 'none'}`,
    () =>
      withOpenkododActivationLock(
        options,
        async (lock) => {
          if (
            !sameOpenkododActivationRecord(
              await readOpenkododActivationRecord(options),
              options.record
            )
          ) {
            return {
              outcome: 'refused',
              code: 'openkodod_rollback_record_changed',
              reason:
                'The host activation record changed while this rollback was waiting. Refresh the ' +
                'host state and review the new rollback target before trying again.'
            }
          }
          return rollbackOpenkododLocked(options, lock)
        },
        async () => {
          const { code, reason } = await openkododActivationFenceRefusal(options, 'rollback')
          return { outcome: 'refused', code, reason }
        }
      ),
    ['rolled-back']
  )
}
