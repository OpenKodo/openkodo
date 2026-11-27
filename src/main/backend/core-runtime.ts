import { getAppEnvironment } from '../../shared/app-lifecycle/app-environment'
import { startOpenkododWithHost } from '../openkodod/host-lifecycle/openkodod-lifecycle'
import type {
  OpenkododHandle,
  OpenkododOptions
} from '../openkodod/serve-startup/openkodod-start-contract'
import { activateBackendServices } from './service-composition'
import { BackendCoreProfileShutdown } from './core-profile-shutdown'

export type BackendCoreHost = {
  userDataPath: string
  supervised: boolean
  options: OpenkododOptions
  prepareCliLauncher(): Promise<void>
  prepareSecrets(userDataPath: string): Promise<void>
  runQuitHandlers(): void
}

export async function startBackendCore(host: BackendCoreHost): Promise<OpenkododHandle> {
  const { userDataPath } = host
  let closeObservability = (): Promise<void> => Promise.resolve()
  const profileShutdown = new BackendCoreProfileShutdown()
  const { readiness, instance, stop } = await startOpenkododWithHost(
    userDataPath,
    (registerCleanup) =>
      activateBackendServices({
        supervised: host.supervised,
        registerCleanup,
        activate: async (cleanup) => {
          const { activateBackendRuntime } = await import('./core-runtime-activation')
          return activateBackendRuntime(host, cleanup, profileShutdown, (close) => {
            closeObservability = close
          })
        }
      }),
    async () => {
      try {
        host.runQuitHandlers()
      } finally {
        // Close after quit handlers, including failed ones, so their spans reach disk.
        const closing = closeObservability()
        closeObservability = () => Promise.resolve()
        await closing
      }
    },
    profileShutdown.checkpoint
  )
  const version = getAppEnvironment().getVersion()
  return {
    readiness,
    managedStop: { version, runtimeId: readiness.runtimeId, instance },
    stop
  }
}
