import type { z } from 'zod'
import { defineMethod } from '../../core'
import type { OpenKodoRuntimeService } from '../../../openkodo-runtime'
import {
  OPENKODOD_TERMINAL_CENSUS_METHOD,
  OpenkododTerminalCensusParamsSchema,
  type OpenkododTerminalCensus
} from '../../../../../shared/remote-runtime/openkodod-lifecycle/openkodod-terminal-census'
import { getStructuredAgentSessionHost } from '../../../../native-chat/agent-session-wire/host/structured-agent-session-registry'

const SPAWN_SETTLE_MS = 10_000
const UNVERIFIABLE: OpenkododTerminalCensus = {
  liveSessions: null,
  startedSinceActivation: null,
  daemonProtocolVersion: null
}

export const OPENKODOD_TERMINAL_CENSUS_METHODS = [
  defineMethod({
    name: OPENKODOD_TERMINAL_CENSUS_METHOD,
    permission: 'host-admin',
    params: OpenkododTerminalCensusParamsSchema,
    handler: async (params, { runtime }) => {
      if (params.closeAdmissionForMs === undefined) {
        return withChatSessions(await countTerminals(params, runtime))
      }
      // Before counting: a terminal admitted after the count would die with the stop, uncounted.
      const admission = runtime.terminalUpdateAdmission
      const admissionClosedUntil = admission.close(params.closeAdmissionForMs)
      // A spawn admitted before the close may still be starting; count only once it has.
      if (admissionClosedUntil > 0 && !(await admission.waitForSpawnsToSettle(SPAWN_SETTLE_MS))) {
        // The unsettled spawn may be an in-process terminal, so no count of them holds either.
        return { ...UNVERIFIABLE, inProcessSessions: null, admissionClosedUntil }
      }
      return { ...withChatSessions(await countTerminals(params, runtime)), admissionClosedUntil }
    }
  })
]

/** Chats are not terminals, but their providers run inside openkodod and end with its stop. */
function withChatSessions(census: OpenkododTerminalCensus): OpenkododTerminalCensus {
  let chatSessions: number | null
  try {
    chatSessions = getStructuredAgentSessionHost()?.chatSessionCount() ?? 0
  } catch {
    chatSessions = null
  }
  return { ...census, chatSessions }
}

async function countTerminals(
  params: z.infer<typeof OpenkododTerminalCensusParamsSchema>,
  runtime: Pick<OpenKodoRuntimeService, 'releaseFinishedAutomationRunTerminals'>
): Promise<OpenkododTerminalCensus> {
  // Import lazily: daemon modules install xterm's global window and must not contaminate every dispatcher process.
  const { collectOpenkododTerminalCensus } =
    await import('../../../../openkodod/diagnostics/openkodod-terminal-census')
  if (!params.releaseFinishedAutomationTerminals) {
    return collectOpenkododTerminalCensus(params.activatedAt)
  }
  const before = await collectOpenkododTerminalCensus(params.activatedAt)
  const released = await runtime.releaseFinishedAutomationRunTerminals()
  return settledCensus(
    () => collectOpenkododTerminalCensus(params.activatedAt),
    before.liveSessions === null ? null : before.liveSessions - released
  )
}

/** Closed sessions leave the daemon a moment after the close; wait briefly for the count to drop. */
async function settledCensus(
  collect: () => Promise<OpenkododTerminalCensus>,
  expectedAtMost: number | null
): Promise<OpenkododTerminalCensus> {
  let census = await collect()
  for (let attempt = 0; attempt < 15 && expectedAtMost !== null; attempt += 1) {
    if (census.liveSessions === null || census.liveSessions <= expectedAtMost) {
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
    census = await collect()
  }
  return census
}
