import {
  formatOpenKodoSessionAddress,
  isOpenKodoSessionId
} from '../../../../../shared/agent-session/identity/openkodo-session-address'
import type { OrchestrationSessionAddressResult } from '../../../../../shared/orchestration/orchestration-caller-status'
import { callRuntimeRpc } from '../../rpc/calls/runtime-rpc-call'
import { RuntimeRpcCallError } from '../../rpc/calls/runtime-rpc-result'
import type { RuntimeClientTarget } from '../../../../../shared/remote-runtime/host-catalog/runtime-client-target'

/**
 * A chat's OpenKodo session ID: its `/clear` root's, which the host derives from the session records.
 * Null for an id that is not an OpenKodo session id.
 */
export async function resolveStructuredSessionOpenKodoSessionId(
  target: RuntimeClientTarget,
  sessionId: string
): Promise<string | null> {
  if (!isOpenKodoSessionId(sessionId)) {
    return null
  }
  try {
    const result = await callRuntimeRpc<OrchestrationSessionAddressResult>(
      target,
      'orchestration.sessionAddress',
      { sessionId }
    )
    return result.openkodoSessionId
  } catch (error) {
    // Why: a host that predates the method routes the current session's ID to the same chat.
    if (error instanceof RuntimeRpcCallError && error.code === 'method_not_found') {
      return formatOpenKodoSessionAddress(sessionId)
    }
    throw error
  }
}
