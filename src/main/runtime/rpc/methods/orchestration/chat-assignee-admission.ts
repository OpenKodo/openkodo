import type { AgentSessionConversationView } from '../../../../../shared/agent-session/lifecycle/leases/agent-session-conversation-view'
import {
  formatOpenKodoSessionAddress,
  type OpenKodoSessionId
} from '../../../../../shared/agent-session/identity/openkodo-session-address'
import { ORCHESTRATION_SESSION_CALLER_ERROR_CODES as CODES } from '../../../../../shared/orchestration/orchestration-session-caller-codes'
import type { OpenKodoRuntimeService } from '../../../openkodo-runtime'
import type { AgentLaunchModeReceipt as WorkerStartModeReceipt } from '../../../../../shared/agent-launch/contracts/agent-launch-intent'
import { observeChatAssignee } from '../../../orchestration/workers/lifecycle/chat-assignee'
import type { OrchestrationDb } from '../../../orchestration/db/orchestration-db'
import { OrchestrationError } from '../../../orchestration/orchestration-error'
import type { OrchestrationPartyIdentity as OrchestrationParty } from '../../../../../shared/orchestration/mailbox/orchestration-party-identity'
import { readAgentSessionRecordStore } from '../../../orchestration/addressing/session-lineage/structured-session-lineage'
import {
  refuseUndeliverableSessionRecipient,
  resolveTerminalAgentRecipient
} from './messaging/session-recipient'

const NO_EFFECTS = 'No effects were applied.'

/** A chat with no worker handle has no pane or process; its Dispatch names it by its OpenKodo session ID alone. */
export const CHAT_WORKER_AUTHORITY = { paneKey: null, processIncarnation: null } as const

/** The chat a party is, whichever name reached it: a structured worker's handle names its chat too. Null for a terminal. */
export function chatAssigneeOf(party: OrchestrationParty): OpenKodoSessionId | null {
  return party.openkodoSessionId
}

/** Use the same reach rules as mail before creating anything; return the assignee's currently running session. */
export async function admitChatAssignee(
  runtime: Pick<OpenKodoRuntimeService, 'ensureStructuredAgentSessionHost'>,
  sessionId: OpenKodoSessionId,
  db: OrchestrationDb
): Promise<AgentSessionConversationView> {
  // A failed install leaves no store, which the refusal below names.
  await runtime.ensureStructuredAgentSessionHost().catch(() => undefined)
  const terminalRecipient = await resolveTerminalAgentRecipient(sessionId)
  // Read after every wait: the store this admission checks is the one it then observes.
  const store = readAgentSessionRecordStore()
  const refusal = refuseUndeliverableSessionRecipient(
    { sessionId, address: formatOpenKodoSessionAddress(sessionId) },
    store,
    db,
    terminalRecipient,
    NO_EFFECTS
  )
  if (refusal) {
    throw new OrchestrationError(refusal.code, refusal.message, { effectsApplied: false })
  }
  const observed = observeChatAssignee(sessionId, db, store)
  if (observed.status !== 'live') {
    throw new OrchestrationError(
      CODES.notLive,
      `Agent session ${sessionId} cannot take a task here: ${observed.reason} ${NO_EFFECTS}`,
      { effectsApplied: false }
    )
  }
  return observed.session
}

/** A coordinator can't be its own worker: it would answer its own task forever. */
export function refuseChatSelfAssignment(args: {
  sessionId: OpenKodoSessionId
  coordinatorSessionId: OpenKodoSessionId | null | undefined
  remedy: string
}): void {
  if (args.sessionId === args.coordinatorSessionId) {
    throw new OrchestrationError(
      'terminal_is_coordinator',
      `${formatOpenKodoSessionAddress(args.sessionId)} is this coordinator's own OpenKodo session ID. ${args.remedy}`
    )
  }
}

/** A chat adopted as a worker is given the task, not launched; the decided mode stands. */
export function chatWorkerMode(
  mode: WorkerStartModeReceipt,
  chat: OpenKodoSessionId | null
): WorkerStartModeReceipt {
  return chat
    ? {
        ...mode,
        detail: `--terminal names the chat ${formatOpenKodoSessionAddress(chat)}; its task goes to that chat and no agent is launched.`
      }
    : mode
}
