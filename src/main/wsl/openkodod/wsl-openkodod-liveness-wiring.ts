/** C7 supplies visible demand; these production probes serve the WSL liveness supervisor. */
import {
  probeThenWatchWslOpenkododBridges,
  type WslOpenkododBridgeActivity
} from './wsl-openkodod-bridge-activity'
import { pairedRuntimeConnectionFromOffer } from '../../../shared/remote-runtime/pairing/paired-runtime-connection'
import { parsePairingCode } from '../../../shared/remote-runtime/pairing/pairing'
import {
  type OpenkododTerminalCensus,
  UNVERIFIABLE_OPENKODOD_TERMINAL_CENSUS
} from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-terminal-census'
import { requestOpenkododTerminalCensus } from '../../managed-server/lifecycle/openkodod-terminal-census-client'
import { subscribeSystemPowerLifecycle } from '../../power/system-power-lifecycle'
import {
  deferUntilWslDistroRunning,
  readSettledConfirmedRunningWslDistros
} from '../discovery/wsl-background-distro-gate'
import type { WslDistroHolder } from '../discovery/wsl-distro-holder-types'
import { readWslGuestIdentity } from '../execution/wsl-guest-process-identity'
import type { WslOpenkododConnection } from './wsl-openkodod-connection-types'
import type { WslOpenkododConnectionManager } from './wsl-openkodod-connection'
import { defaultWslOpenkododEnvironmentId } from './wsl-openkodod-deploy'
import { EXIT_SETTLE_MS } from './wsl-openkodod-liveness-evidence'
import { requireConfirmedRunning } from './wsl-openkodod-connection-errors'
import { WslOpenkododLivenessSupervisor } from './wsl-openkodod-liveness-supervisor'
import { createWslOpenkododHostTransport } from './wsl-openkodod-host-transport'
import { openWslOpenkododWatch } from './wsl-openkodod-watch'
import { isWslHostIdleStopped } from '../host-lifecycle/wsl-host-idle-stop'

function transportFor(distro: string, environmentId = defaultWslOpenkododEnvironmentId(distro)) {
  return createWslOpenkododHostTransport({
    target: { kind: 'wsl', id: environmentId, distro, label: distro }
  })
}

/** Every session counts (activation time 0): liveness asks how many survived, not how new. */
function collectWslOpenkododCensus(
  connection: WslOpenkododConnection
): Promise<OpenkododTerminalCensus> {
  const offer = parsePairingCode(connection.pairingOffer)
  return offer
    ? requestOpenkododTerminalCensus(pairedRuntimeConnectionFromOffer(offer), 0)
    : Promise.resolve(UNVERIFIABLE_OPENKODOD_TERMINAL_CENSUS)
}

export function createWslOpenkododLivenessSupervisor(options: {
  manager: WslOpenkododConnectionManager
  bridgeActivity: WslOpenkododBridgeActivity
  holder: WslDistroHolder
  hasUserVisibleWork: (distro: string) => boolean | Promise<boolean>
}): WslOpenkododLivenessSupervisor {
  return new WslOpenkododLivenessSupervisor({
    manager: options.manager,
    readRunning: ({ distro, exitedAt, probedAfter }) => {
      const settled =
        exitedAt === null || exitedAt === undefined ? undefined : exitedAt + EXIT_SETTLE_MS
      return readSettledConfirmedRunningWslDistros(
        distro,
        probedAfter === undefined ? settled : Math.max(settled ?? -Infinity, probedAfter)
      )
    },
    readIdentity: (distro, openkododPid) =>
      readWslGuestIdentity(transportFor(distro), openkododPid),
    openWatch: (connection) =>
      probeThenWatchWslOpenkododBridges(
        () =>
          openWslOpenkododWatch(
            transportFor(connection.distro, connection.environmentId),
            connection.remotePort
          ),
        options.bridgeActivity,
        connection.environmentId
      ),
    collectCensus: collectWslOpenkododCensus,
    hasUserVisibleWork: options.hasUserVisibleWork,
    // Registered hosts use the default id; the idle-stop close lands before the exit's settle ends.
    wasIdleStopped: (distro) => isWslHostIdleStopped(defaultWslOpenkododEnvironmentId(distro)),
    deferUntilRunning: deferUntilWslDistroRunning,
    requireRunning: async (distro) =>
      requireConfirmedRunning(await readSettledConfirmedRunningWslDistros(distro), distro),
    // Liveness is background work: the holder may re-spawn only into a distro that runs (E9).
    ensureHolder: (distro) =>
      options.holder.ensureHeld(distro, {
        requireRunning: async () =>
          requireConfirmedRunning(await readSettledConfirmedRunningWslDistros(distro), distro)
      }),
    subscribePower: subscribeSystemPowerLifecycle
  })
}
