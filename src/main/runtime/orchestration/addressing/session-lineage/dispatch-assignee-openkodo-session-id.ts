import {
  parseOpenKodoSessionAddress,
  type OpenKodoSessionId
} from '../../../../../shared/agent-session/identity/openkodo-session-address'
import { structuredWorkerOpenKodoSessionIdForIncarnation } from '../../terminal-authority/structured-sessions/structured-worker-identity'
import { canonicalOpenKodoSessionId } from './canonical-openkodo-session-id'

/** Resolve structured incarnations or chat addresses to bare session ids; PTYs have none. */
export function dispatchAssigneeOpenKodoSessionId(assignee: {
  handle: string
  processIncarnation: string | null | undefined
}): OpenKodoSessionId | null {
  const openkodoSessionId =
    structuredWorkerOpenKodoSessionIdForIncarnation(assignee.processIncarnation) ??
    parseOpenKodoSessionAddress(assignee.handle)
  return openkodoSessionId === null ? null : canonicalOpenKodoSessionId(openkodoSessionId)
}
