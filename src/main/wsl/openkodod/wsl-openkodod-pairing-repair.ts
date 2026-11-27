/** Use the managed SSH repair gate for refused WSL enrollment: serialize, cap attempts and require the pinned host key. Read new offers inside the local distro. */
import { resolveEnvironment } from '../../../shared/remote-runtime/host-store/runtime-environment-store'
import {
  findWslHostDeployment,
  refreshWslHostPairing
} from '../../../shared/remote-runtime/host-store/runtime-environment-wsl-host-store'
import type { KnownRuntimeEnvironment } from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import { readActiveManagedOpenkododReadiness } from '../../managed-server/lifecycle/openkodod-managed-bound-port'
import {
  ManagedOpenkododPairingRepairs,
  type ManagedOpenkododPairingRepairDeps
} from '../../managed-server/lifecycle/openkodod-managed-pairing-repair'

import { OpenkododManagedPairingRepairFailedError } from '../../managed-server/lifecycle/openkodod-managed-pairing-repair-failure'
import { notifyManagedOpenkododPairingRepaired } from '../../managed-server/lifecycle/openkodod-managed-pairing-repaired-listener'
import type { WslOpenkododHostTarget } from './wsl-openkodod-host-target'
import {
  type WslOpenkododHostTransport,
  createWslOpenkododHostTransport
} from './wsl-openkodod-host-transport'
import type { WslOpenkododPairingRecovery } from './wsl-openkodod-pairing-identity'

type WslOpenkododHostAccess = {
  target: WslOpenkododHostTarget
  connection: WslOpenkododHostTransport
}

export function liveWslOpenkododPairingRepairDeps(
  userDataPath: string
): ManagedOpenkododPairingRepairDeps<WslOpenkododHostAccess> {
  const record = async (environmentId: string) => {
    const found = await findWslHostDeployment(userDataPath, environmentId)
    if (!found) {
      throw new OpenkododManagedPairingRepairFailedError('this server is not a WSL host')
    }
    return found
  }
  return {
    resolve: async (environmentId) => await resolveEnvironment(userDataPath, environmentId),
    connect: async (environment: KnownRuntimeEnvironment) => {
      const target: WslOpenkododHostTarget = {
        kind: 'wsl',
        id: environment.id,
        distro: (await record(environment.id)).distro,
        label: environment.name
      }
      return { target, connection: createWslOpenkododHostTransport({ target }) }
    },
    readReadiness: async (access) => {
      try {
        return await readActiveManagedOpenkododReadiness(access)
      } finally {
        access.connection.dispose()
      }
    },
    ports: async (environment) => {
      const found = await findWslHostDeployment(userDataPath, environment.id)
      return found ? { localPort: found.localPort, remotePort: found.remotePort } : null
    },
    refresh: async (environmentId, pairingCode) => {
      const { localPort, remotePort } = await record(environmentId)
      return (
        await refreshWslHostPairing(userDataPath, environmentId, {
          pairingCode,
          localPort,
          remotePort
        })
      ).environment
    },
    repaired: notifyManagedOpenkododPairingRepaired,
    now: Date.now
  }
}

/** One gate per desktop, so the cap and a standing failure hold across every WSL connect. */
export function createWslOpenkododPairingRecovery(
  userDataPath: string,
  deps: ManagedOpenkododPairingRepairDeps<WslOpenkododHostAccess> = liveWslOpenkododPairingRepairDeps(
    userDataPath
  )
): Omit<WslOpenkododPairingRecovery, 'environmentId'> {
  return { repairs: new ManagedOpenkododPairingRepairs(deps), resolve: deps.resolve }
}
