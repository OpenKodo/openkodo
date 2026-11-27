import type { Store } from '../../persistence/loading-store/store'
import type { OpenKodoRuntimeService } from '../../runtime/openkodo-runtime'
import { startWorkspaceCleanupRunner } from '../../workspaces/cleanup/workspace-cleanup-runner-startup'
import { getWorkspaceCleanupRunner } from '../../workspaces/cleanup/workspace-cleanup-runner-registry'
import {
  openkododAutomationsKeepHostBusy,
  startOpenkododAutomations
} from './openkodod-automations'
import type { OpenkododUsageClients } from './openkodod-usage-service'

/** The host's own background jobs: automation schedules and workspace cleanup rules. */
export function startOpenkododSchedulers(
  runtime: OpenKodoRuntimeService,
  store: Store,
  usage: OpenkododUsageClients,
  registerCleanup: (cleanup: () => void) => void
): void {
  startOpenkododAutomations(runtime, store, usage, registerCleanup)
  const cleanupRunner = startWorkspaceCleanupRunner(runtime, store)
  registerCleanup(() => cleanupRunner?.stop())
}

/** A cleanup run mid-removal must finish before idle exit, like a pending automation run. */
export function openkododSchedulersKeepHostBusy(
  runtime: OpenKodoRuntimeService,
  store: Store
): boolean {
  return (
    openkododAutomationsKeepHostBusy(store) ||
    getWorkspaceCleanupRunner(runtime)?.isRunning() === true
  )
}
