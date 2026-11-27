import { HEADLESS_RUNTIME_WINDOW_ID } from '../../../shared/remote-runtime/session-graph/runtime-session-contracts'
import type { OpenKodoRuntimeService } from '../openkodo-runtime'

/** Publish readiness without a renderer so status and session-tab inventory do not wait forever. */
export function publishHeadlessRuntimeGraph(
  runtime: Pick<OpenKodoRuntimeService, 'syncWindowGraph'>
): void {
  runtime.syncWindowGraph(
    HEADLESS_RUNTIME_WINDOW_ID,
    { tabs: [], leaves: [] },
    { includeAgentSenders: false }
  )
}
