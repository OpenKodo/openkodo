import type { OpenKodoSessionId } from '../../agent-session/identity/openkodo-session-address'

/** PTY parties use terminal handle/pane, structured parties use OpenKodo session identity (openkodo_session_id:<id>).
 * Structured workers also have handles/panes; ordinary chats do not. Build identity at lookup boundaries and pass it whole. */
export type OrchestrationPartyIdentity = Readonly<{
  /** Mailbox address the party sends from and reads: its terminal handle, else its session address. */
  address: string
  terminalHandle: string | null
  paneKey: string | null
  /** The bare OpenKodo session id the party is addressed by; mail spells it `openkodo_session_id:<id>`. */
  openkodoSessionId: OpenKodoSessionId | null
}>
