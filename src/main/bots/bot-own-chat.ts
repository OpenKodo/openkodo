// A bot's own chat, as its chat list counts one; never a worker a Dispatch started in its home.
import type { AgentSessionConversationView } from '../../shared/agent-session/lifecycle/leases/agent-session-conversation-view'
import {
  isOpenKodoSessionId,
  type OpenKodoSessionId
} from '../../shared/agent-session/identity/openkodo-session-address'
import { resolveOpenKodoSessionParty } from '../runtime/orchestration/addressing/orchestration-party'
import type { AgentSessionRecordReader } from '../runtime/orchestration/addressing/session-lineage/structured-session-lineage'
import type { SessionPartyReader } from '../runtime/orchestration/addressing/session-party-reader'
import { botChatRecordRow } from '../runtime/rpc/methods/bots-chats'

/** Orchestration's own answer: a structured worker's party carries its handle; a lost one throws. */
function isStructuredWorkerSession(
  sessionId: OpenKodoSessionId,
  db: SessionPartyReader,
  store: AgentSessionRecordReader
): boolean {
  try {
    return resolveOpenKodoSessionParty(sessionId, db, store).terminalHandle !== null
  } catch {
    return true
  }
}

export function isBotOwnChat(
  record: AgentSessionConversationView,
  db: SessionPartyReader,
  store: AgentSessionRecordReader
): boolean {
  // Whether the list shows a record does not depend on which root it is listed under.
  return (
    isOpenKodoSessionId(record.sessionId) &&
    botChatRecordRow(record, (id) => id, null) !== null &&
    !isStructuredWorkerSession(record.sessionId, db, store)
  )
}
