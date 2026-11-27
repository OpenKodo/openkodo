import type { RunRow } from '../db/orchestration-records'
import type { PeerRunRow } from '../db/peer-runs/peer-run-store'
import { isEquivalentPaneKey } from '../db/pane-key-match'
import { currentRunCoordinatorOpenKodoSessionId } from '../db/runs/run-coordinator-openkodo-session'
import {
  formatOpenKodoSessionAddress,
  type OpenKodoSessionId
} from '../../../../shared/agent-session/identity/openkodo-session-address'
import type { OrchestrationPartyIdentity as OrchestrationCallerIdentity } from '../../../../shared/orchestration/mailbox/orchestration-party-identity'

/** The part of a caller a Run binding stores and matches. */
export type OrchestrationCoordinatorKey = Pick<
  OrchestrationCallerIdentity,
  'terminalHandle' | 'paneKey' | 'openkodoSessionId'
>

/** A caller the dispatch entry resolved from the OpenKodo session id in its injected environment. */
export type OrchestrationSessionCaller = OrchestrationCallerIdentity &
  Readonly<{
    kind?: undefined
    openkodoSessionId: OpenKodoSessionId
    /** The session record the request came from. */
    sessionId: OpenKodoSessionId
    /** Where the session runs, from its record; `worker-start --worktree current` places here. */
    workspaceId: string
  }>

/** A paired OpenKodo acting as the coordinator of its Run here, as its authenticated frame names it.
 *  Its handle and binding key are its address, which no terminal or session here can have. */
export type OrchestrationPeerCaller = OrchestrationCallerIdentity &
  Readonly<{
    kind: 'peer'
    terminalHandle: string
    paneKey: string
    openkodoSessionId: null
    peerRun: PeerRunRow
  }>

/** The caller the dispatch entry resolved, which wins over any declared handle: a session from
 *  its environment, or a paired OpenKodo from its pairing. */
export type OrchestrationEntryCaller = OrchestrationSessionCaller | OrchestrationPeerCaller

/** The address, and Run binding key, of the paired OpenKodo coordinating a conversation's Run here. */
export function peerCoordinatorAddress(conversationId: string): string {
  return `${PEER_ADDRESS_PREFIX}${conversationId}`
}

const PEER_ADDRESS_PREFIX = 'peer:'

export function isPeerCoordinatorAddress(value: string | null | undefined): boolean {
  return !!value?.startsWith(PEER_ADDRESS_PREFIX)
}

export function peerCoordinatorCaller(peerRun: PeerRunRow): OrchestrationPeerCaller {
  const address = peerCoordinatorAddress(peerRun.conversation_id)
  return Object.freeze({
    kind: 'peer',
    address,
    terminalHandle: address,
    paneKey: address,
    openkodoSessionId: null,
    peerRun
  })
}

export function isPeerCaller(
  caller: OrchestrationCallerIdentity | null | undefined
): caller is OrchestrationPeerCaller {
  return !!caller && 'kind' in caller && caller.kind === 'peer'
}

/** The chat session behind a caller; a paired OpenKodo has none here. */
export function sessionCallerOf(
  caller: OrchestrationEntryCaller | undefined
): OrchestrationSessionCaller | undefined {
  return caller?.kind === 'peer' ? undefined : caller
}

/** A caller with neither a pane nor an OpenKodo session id can never be bound to a Run. */
export function hasRunBindingKey(caller: OrchestrationCoordinatorKey): boolean {
  return caller.paneKey !== null || caller.openkodoSessionId !== null
}

/** The one address a party reads mail at and is sent mail at; null for a key naming nobody. */
export function mailboxAddressOf(
  party: Pick<OrchestrationCoordinatorKey, 'terminalHandle' | 'openkodoSessionId'>
): string | null {
  // Workers read mail at their handles, so prefer that address when both identities exist.
  if (party.terminalHandle !== null) {
    return party.terminalHandle
  }
  return party.openkodoSessionId === null
    ? null
    : formatOpenKodoSessionAddress(party.openkodoSessionId)
}

/** Who a Run's binding names now; an OpenKodo session id an older binding left behind is not part of it. */
export function runCoordinatorKey(run: RunRow): OrchestrationCoordinatorKey {
  return {
    terminalHandle: run.coordinator_handle,
    paneKey: run.coordinator_pane_key,
    openkodoSessionId: currentRunCoordinatorOpenKodoSessionId(run)
  }
}

export function runBoundToCoordinator(
  run: Pick<
    RunRow,
    | 'coordinator_pane_key'
    | 'coordinator_openkodo_session_id'
    | 'coordinator_openkodo_session_id_generation'
    | 'consumer_generation'
  >,
  caller: OrchestrationCoordinatorKey
): boolean {
  if (
    caller.paneKey !== null &&
    run.coordinator_pane_key !== null &&
    isEquivalentPaneKey(run.coordinator_pane_key, caller.paneKey)
  ) {
    return true
  }
  return (
    caller.openkodoSessionId !== null &&
    currentRunCoordinatorOpenKodoSessionId(run) === caller.openkodoSessionId
  )
}
