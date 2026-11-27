import type { OpenkododTerminalCensus } from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-terminal-census'
import type { OpenkododRollbackResult } from '../install/openkodod-remote-rollback'

export function rollbackRecountRefusal(
  census: OpenkododTerminalCensus
): OpenkododRollbackResult | null {
  const live = census.liveSessions
  if (live === 0) {
    return null
  }
  return {
    outcome: 'refused',
    code:
      live === null
        ? 'openkodod_rollback_census_unavailable'
        : 'openkodod_rollback_terminals_running',
    reason:
      live === null
        ? 'The server did not answer how many terminals it runs. Retry when it answers.'
        : 'A terminal opened on this server before it could be stopped; close it, then retry.'
  }
}

export const ROLLBACK_STALE_COUNT: OpenkododRollbackResult = {
  outcome: 'refused',
  code: 'openkodod_rollback_census_unavailable',
  reason: 'The terminal count went stale before the server could be stopped. Retry the rollback.'
}
