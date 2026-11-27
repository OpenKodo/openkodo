/** Which census an activation may plan on, and when it asks the candidate which daemons are alive. */
import type { OpenkododDeployOptions } from '../install/openkodod-remote-deploy'
import type { OpenkododActivationRecord } from './openkodod-activation-record'
import { planOpenkododUpdate, type OpenkododUpdateForce } from './openkodod-update-plan'
import {
  isAnsweredOpenkododTerminalCensus,
  type OpenkododTerminalCensus,
  UNVERIFIABLE_OPENKODOD_TERMINAL_CENSUS
} from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-terminal-census'
import {
  censusNeedsHostDaemonProtocols,
  CURRENT_OPENKODOD_DAEMON_PROTOCOL
} from './openkodod-daemon-protocol-crossing'

export type OpenkododUpdatePlan = ReturnType<typeof planOpenkododUpdate>

export function countedLockedRecord(
  options: Pick<OpenkododDeployOptions, 'censusRecord'>,
  record: OpenkododActivationRecord
): boolean {
  const counted = options.censusRecord
  return (
    !counted || (counted.active === record.active && counted.activatedAt === record.activatedAt)
  )
}

/** A census of another incumbent cannot authorize stopping this one. */
export function censusForLockedRecord(
  options: Pick<OpenkododDeployOptions, 'censusRecord' | 'census'>,
  record: OpenkododActivationRecord
): OpenkododTerminalCensus {
  return countedLockedRecord(options, record)
    ? options.census
    : UNVERIFIABLE_OPENKODOD_TERMINAL_CENSUS
}

/** Old hosts cannot name mixed generations, nor a dead daemon count sessions; the candidate can. */
export function asksCandidateForLiveDaemons(
  census: OpenkododTerminalCensus,
  force: OpenkododUpdateForce | undefined
): boolean {
  // Only full force probes an uncounted census: a failed probe must not mark a deferred host incompatible.
  return (
    censusNeedsHostDaemonProtocols(census) ||
    (force === true && census.liveSessions === null && isAnsweredOpenkododTerminalCensus(census))
  )
}

export function openkododUpdatePlanner(
  record: OpenkododActivationRecord,
  candidateVersion: string,
  force: OpenkododUpdateForce | undefined
): (
  census: OpenkododTerminalCensus,
  hostDaemonProtocols?: readonly number[]
) => OpenkododUpdatePlan {
  return (census, hostDaemonProtocols) =>
    planOpenkododUpdate({
      record,
      candidateVersion,
      census,
      candidateDaemonProtocol: CURRENT_OPENKODOD_DAEMON_PROTOCOL,
      ...(hostDaemonProtocols ? { hostDaemonProtocols } : {}),
      ...(force !== undefined ? { force } : {})
    })
}
