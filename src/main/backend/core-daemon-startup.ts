import type { BackendServiceCleanup } from './service-composition'
import type { createOpenkododStartupTiming } from '../openkodod/diagnostics/openkodod-startup-timing'

export async function prepareBackendDaemon(
  loginEnvironment: Promise<unknown>,
  timed: ReturnType<typeof createOpenkododStartupTiming>['time'],
  registerCleanup: (cleanup: BackendServiceCleanup) => void
) {
  const { startOpenkododDaemon, stopOpenkododDaemon } =
    await import('../openkodod/daemon/openkodod-daemon-supervision')
  // The daemon and its PTYs inherit the adopted login env and nothing later startup writes, so it
  // spawns as soon as that lands, alongside imports, stores and hooks. Rejects only when supervised.
  const daemonStartup = loginEnvironment.then(() => timed('daemon', () => startOpenkododDaemon()))
  // Observed now: an early abort may never reach the await below.
  void daemonStartup.catch(() => {})
  // Registered first, so it runs last (cleanups run in reverse) and covers an import that throws
  // mid-spawn. It disconnects without killing daemon PTYs that must survive restart, after an
  // in-flight spawn settles; a failed one leaves only the disconnect to do.
  registerCleanup(() => daemonStartup.catch(() => {}).then(() => stopOpenkododDaemon()))
  return { ready: daemonStartup }
}
