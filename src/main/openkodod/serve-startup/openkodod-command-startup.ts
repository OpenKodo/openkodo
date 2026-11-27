import { startOpenkodod } from '../host-runtime/openkodod-entry'
import process from 'node:process'
import { resolveOpenkododInstallRoot } from '../host-runtime/openkodod-app-paths'
import { OPENKODOD_USAGE, parseArgs } from './openkodod-command-arguments'
import {
  installOpenkododShutdownSignals,
  type OpenkododShutdownTrigger
} from '../host-lifecycle/openkodod-lifecycle'
import { installOpenkododProcessErrorGuards } from '../host-lifecycle/openkodod-process-error-guards'
import { installOpenkododStopRequestListeners } from '../host-lifecycle/managed-stop/openkodod-stop-request-listener'
import { prepareOpenkododManagedStop } from '../host-lifecycle/managed-stop/openkodod-managed-stop-admission'
import { bindOpenkododIdleShutdown } from '../host-lifecycle/idle-exit/openkodod-managed-idle-exit-host'

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const options = parseArgs(argv)
  if (options.help) {
    console.log(OPENKODOD_USAGE)
    return
  }
  let shutdownTrigger: OpenkododShutdownTrigger | null = null
  // Fire-and-forget startup work can reject before its first await completes.
  installOpenkododProcessErrorGuards(() => shutdownTrigger)
  const startup = startOpenkodod(options)
  const requestShutdown = installOpenkododShutdownSignals(async () => (await startup).stop())
  shutdownTrigger = requestShutdown
  const handle = await startup
  // Stop requests must name the runtime/instance established by startup.
  installOpenkododStopRequestListeners(() => requestShutdown('stop request'), {
    installRoot: resolveOpenkododInstallRoot(),
    managedStop: handle.managedStop,
    beforeManagedStop: prepareOpenkododManagedStop
  })
  bindOpenkododIdleShutdown(requestShutdown)
}
