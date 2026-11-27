import { OPENKODO_SESSION_ADDRESS_PREFIX } from '../../../shared/agent-session/identity/openkodo-session-address-prefix'
import {
  isOpenKodoSessionId,
  parseOpenKodoSessionAddress,
  type OpenKodoSessionId
} from '../../../shared/agent-session/identity/openkodo-session-address'
import { isTerminalHandle } from '../../../shared/terminal/terminal-handle-prefix'
import type { AgentSessionConversationView } from '../../../shared/agent-session/lifecycle/leases/agent-session-conversation-view'
import { AGENT_CONVERSATION_REFUSAL_CODES as CODES } from '../../../shared/agent-conversations/agent-conversation-contracts'
import { lookupOpenKodoAgentSession } from '../orchestration/mailbox/routing/structured-session-mail-address'
import {
  conversationRecordReader,
  readAgentSessionRecordStore,
  type AgentSessionRecordReader
} from '../orchestration/addressing/session-lineage/structured-session-lineage'
import { canonicalOpenKodoSessionId } from '../orchestration/addressing/session-lineage/canonical-openkodo-session-id'
import { agentHookServer } from '../../agent-hooks/server/agent-hook-server'
import type { AgentSessionRecordStore } from '../agent-session/records/agent-session-record-store'
import { AgentConversationRefusal } from './agent-conversation-refusal'
import { isReverseLookupUnavailable } from '../../agent-hooks/identity/agent-identity-worker-protocol'

export type ResolvedAgentConversation =
  | {
      kind: 'chat'
      /** The conversation's /clear root, the ID Copy OpenKodo Session ID copies. */
      openkodoSessionId: OpenKodoSessionId
      record: AgentSessionConversationView
      store: AgentSessionRecordReader
    }
  | { kind: 'terminal'; openkodoSessionId: OpenKodoSessionId }

/** One OpenKodo session ID to the conversation it names on this host: chats first, from the chat
 *  store alone, then this host's terminal agent ids. Resolution reads records only; it never
 *  needs, starts or wakes a running agent. */
export async function resolveAgentConversation(
  runtime: { openAgentSessionRecordStore(): Promise<AgentSessionRecordStore> },
  input: string
): Promise<ResolvedAgentConversation> {
  const text = input.trim()
  if (isTerminalHandle(text)) {
    throw new AgentConversationRefusal(
      CODES.terminalHandle,
      `${text} is a terminal handle, which changes when the terminal restarts. Use \`openkodo terminal …\` for it, or the agent's \`openkodo_session_id:\` from \`openkodo agent list\`.`
    )
  }
  const id = openkodoSessionIdOf(text)
  const store =
    readAgentSessionRecordStore() ??
    (await runtime
      .openAgentSessionRecordStore()
      .then(conversationRecordReader)
      .catch(() => null))
  // A provider's own id is matched as typed; only OpenKodo IDs are respelled.
  const asTyped = store ? lookupOpenKodoAgentSession(store, text) : null
  if (asTyped?.kind === 'provider-id') {
    throw providerIdRefusal(text, [asTyped.openkodoSessionId], store)
  }
  const found = store && id ? (id === text ? asTyped : lookupOpenKodoAgentSession(store, id)) : null
  if (found?.kind === 'found' && store && id) {
    return {
      kind: 'chat',
      openkodoSessionId: canonicalOpenKodoSessionId(id, store),
      record: found.record,
      store
    }
  }
  if (id) {
    const known = await agentHookServer.isTerminalAgentId(id)
    if (known === true) {
      return { kind: 'terminal', openkodoSessionId: id }
    }
    if (known === undefined) {
      throw new AgentConversationRefusal(
        CODES.unavailable,
        `OpenKodo can't look up terminal agent IDs right now, so it can't tell whether agent ${id} runs here. Try again in a moment.`
      )
    }
  }
  // A provider's own id (a bare UUID can also pass as an OpenKodo ID) gets the ID to use instead.
  const linked = text ? await agentHookServer.terminalAgentIdsOfProviderSession(text) : []
  if (linked === undefined) {
    throw new AgentConversationRefusal(
      CODES.unavailable,
      `OpenKodo can't look up agent IDs right now, so it can't tell whether ${text} names an agent here. Try again in a moment.`
    )
  }
  if (isReverseLookupUnavailable(linked)) {
    // Chat and terminal membership both missed, and this file can't convert provider ids: that
    // says nothing about whether the agent exists or where.
    throw new AgentConversationRefusal(
      CODES.unavailable,
      `OpenKodo can't tell what ${text} names: no agent here has that ID, and this identity file can't look up provider conversation ids in the current version. Copy the agent's ID with Copy OpenKodo Session ID, or find it with \`openkodo agent list\`.`
    )
  }
  if (Array.isArray(linked) && linked.length > 0) {
    throw providerIdRefusal(text, linked, store)
  }
  throw id
    ? new AgentConversationRefusal(
        CODES.unknown,
        `No agent ${text} on this OpenKodo. If it runs on another host, run this there or add \`--environment <host>\`.`
      )
    : new AgentConversationRefusal(
        CODES.invalidId,
        `${text || 'That'} is not an OpenKodo session ID. Find agents' IDs with \`openkodo agent list\`, or copy one with Copy OpenKodo Session ID.`
      )
}

/** The OpenKodo ID `text` spells: an `openkodo_session_id:` address or a bare ID. Older IDs spell their
 *  UUID with underscores, so a hyphenated legacy `<agent>_<uuid>` is respelled to match. */
function openkodoSessionIdOf(text: string): OpenKodoSessionId | null {
  const bare = (
    text.startsWith(OPENKODO_SESSION_ADDRESS_PREFIX)
      ? text.slice(OPENKODO_SESSION_ADDRESS_PREFIX.length)
      : text
  ).replace(
    /_([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})$/i,
    '_$1_$2_$3_$4_$5'
  )
  return text.startsWith(OPENKODO_SESSION_ADDRESS_PREFIX)
    ? parseOpenKodoSessionAddress(`${OPENKODO_SESSION_ADDRESS_PREFIX}${bare}`)
    : isOpenKodoSessionId(bare)
      ? bare
      : null
}

function providerIdRefusal(
  given: string,
  openkodoSessionIds: readonly string[],
  store: AgentSessionRecordReader | null
): AgentConversationRefusal {
  const addresses = openkodoSessionIds.map(
    (id) =>
      `${OPENKODO_SESSION_ADDRESS_PREFIX}${isOpenKodoSessionId(id) ? canonicalOpenKodoSessionId(id, store) : id}`
  )
  return new AgentConversationRefusal(
    CODES.providerId,
    `${given} is the agent's own conversation id, not its OpenKodo session ID. Address it as ${addresses.join(' or ')}.`
  )
}
