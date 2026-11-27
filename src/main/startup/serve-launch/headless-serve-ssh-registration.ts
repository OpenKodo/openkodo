import type { Store } from '../../persistence/loading-store/store'
import type { OpenKodoRuntimeService } from '../../runtime/openkodo-runtime'
import { registerSshHandlers } from '../../ipc/ssh/ssh'
import { mainProcessState as state } from '../main-process-state'

/** Register SSH before any window so headless serve can list/connect targets (#25886, #8489); later window registration is idempotent. */
export async function registerHeadlessServeSshHandlers(
  store: Store,
  runtime: OpenKodoRuntimeService
): Promise<void> {
  await registerSshHandlers(store, () => state.mainWindow ?? null, runtime)
}
