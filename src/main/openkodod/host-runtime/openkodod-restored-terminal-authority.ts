import { OPENKODO_LAYOUT_OWNER_IS_MAIN } from '../../../shared/workspace-layout/layout-owner-switch'
import type { OpenKodoRuntimeService } from '../../runtime/openkodo-runtime'
import type { OpenkododFeatureReadiness } from '../../runtime/rpc/startup/openkodod-readiness'
import { placeUnshownLiveTerminalsBestEffort } from '../../runtime/terminal/adoption/unshown-live-terminal-placement'
import type { createOpenkododStartupTiming } from '../diagnostics/openkodod-startup-timing'

/** Restored orchestration authority, the legacy terminal reconcile and unshown placement, in order. */
export async function restoreOpenkododTerminalAuthority(
  runtime: OpenKodoRuntimeService,
  timed: ReturnType<typeof createOpenkododStartupTiming>['time'],
  readiness: OpenkododFeatureReadiness
): Promise<void> {
  await timed('orchestration', () => runtime.refreshRestoredOrchestrationAuthority())
  readiness.open('orchestration')
  // Terminal inventory stays on the critical path: no latch, every client needs it at connect.
  await timed('reconcile-terminals', () => runtime.reconcileLegacyWorkerTerminals())
  // Off the critical path: it waits for chat continuations and reports what they left.
  void runtime.reportWorkerStopsAcrossRestartOnce()
  if (OPENKODO_LAYOUT_OWNER_IS_MAIN) {
    await placeUnshownLiveTerminalsBestEffort(runtime)
  }
  readiness.open('unshownPlacement')
}
