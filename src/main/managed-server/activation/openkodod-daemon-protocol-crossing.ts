/** Daemons outlive openkodod swaps; incoming builds can attach only current/previous daemon protocols, matching config/scripts/daemon-protocol-facts.mjs canAttach. */
import {
  PREVIOUS_DAEMON_PROTOCOL_VERSIONS,
  PROTOCOL_VERSION
} from '../../daemon/protocol/daemon-protocol-version'
import type { OpenkododTerminalCensus } from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-terminal-census'

export type OpenkododDaemonProtocolFacts = {
  protocolVersion: number
  previousProtocolVersions: readonly number[]
}

export const CURRENT_OPENKODOD_DAEMON_PROTOCOL: OpenkododDaemonProtocolFacts = {
  protocolVersion: PROTOCOL_VERSION,
  previousProtocolVersions: PREVIOUS_DAEMON_PROTOCOL_VERSIONS
}

export function openkododBuildCanAttachDaemon(
  reader: OpenkododDaemonProtocolFacts,
  ownerProtocolVersion: number
): boolean {
  return (
    reader.protocolVersion === ownerProtocolVersion ||
    reader.previousProtocolVersions.includes(ownerProtocolVersion)
  )
}

export type OpenkododLiveDaemonCrossing =
  | { state: 'no-live-terminals' }
  | { state: 'attachable' }
  | { state: 'strands-live-terminals'; unattachable: readonly number[] }
  | { state: 'unverifiable' }

/** A counted census of live terminals from a host that predates the protocol set, so it cannot name mixed generations. */
export function censusNeedsHostDaemonProtocols(census: OpenkododTerminalCensus): boolean {
  // An uncounted census is not crossed here: only force passes it, once the candidate proves no daemon alive.
  return (
    census.liveSessions !== null &&
    census.liveSessions > 0 &&
    census.daemonProtocolVersions === undefined &&
    census.daemonProtocolVersion === null
  )
}

function liveDaemonProtocols(
  census: OpenkododTerminalCensus,
  hostDaemonProtocols: readonly number[] | undefined
): readonly number[] | null {
  if (census.daemonProtocolVersions !== undefined) {
    return census.daemonProtocolVersions
  }
  if (census.daemonProtocolVersion !== null) {
    return [census.daemonProtocolVersion]
  }
  return censusNeedsHostDaemonProtocols(census) ? (hostDaemonProtocols ?? null) : null
}

/** An unknown session count or daemon protocol is planned for as live and unattachable. */
export function assessOpenkododLiveDaemonCrossing(
  census: OpenkododTerminalCensus,
  incoming: OpenkododDaemonProtocolFacts,
  /** Every daemon generation alive on the host, as the incoming build observed it. */
  hostDaemonProtocols?: readonly number[]
): OpenkododLiveDaemonCrossing {
  if (census.liveSessions === 0) {
    return { state: 'no-live-terminals' }
  }
  const protocols = liveDaemonProtocols(census, hostDaemonProtocols)
  if (protocols === null || protocols.length === 0) {
    return { state: 'unverifiable' }
  }
  // Every generation must stay reachable; one unattachable daemon strands its terminals.
  const unattachable = protocols.filter(
    (protocol) => !openkododBuildCanAttachDaemon(incoming, protocol)
  )
  return unattachable.length === 0
    ? { state: 'attachable' }
    : { state: 'strands-live-terminals', unattachable }
}

export function describeDaemonProtocols(protocols: readonly number[]): string {
  return protocols.length === 1 ? `protocol ${protocols[0]}` : `protocols ${protocols.join(', ')}`
}
