/** E1: open a temporary bridge for incumbent census before activation. Unproven state is unverifiable, never zero; WSL has no standing deploy tunnel. */
import { pairedRuntimeConnectionFromOffer } from '../../../shared/remote-runtime/pairing/paired-runtime-connection'
import { parsePairingCode } from '../../../shared/remote-runtime/pairing/pairing'
import type { PairingOffer } from '../../../shared/remote-runtime/pairing/mobile-relay-pairing-offer'
import { OPENKODOD_MANAGED_REMOTE_PORT } from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-managed-runtime'
import {
  type OpenkododTerminalCensus,
  UNVERIFIABLE_OPENKODOD_TERMINAL_CENSUS
} from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-terminal-census'
import type { ServeReadiness } from '../../server/serve-readiness'
import { probeActiveOpenkododReadiness } from '../../managed-server/activation/openkodod-active-readiness'
import { openkododBoundPort } from '../../managed-server/lifecycle/openkodod-managed-bound-port'
import { managedOpenkododInstallDir } from '../../managed-server/lifecycle/openkodod-managed-runtime-context'
import { wakeStoppedManagedOpenkodod } from '../../managed-server/lifecycle/openkodod-managed-wake'
import type { OpenkododRemoteContext } from '../../managed-server/install/openkodod-remote-context'
import type { OpenkododSlotOptions } from '../../managed-server/activation/openkodod-recovery-slot'
import { readRemoteOpenkododBuildHash } from '../../managed-server/install/openkodod-remote-build-hash'
import {
  requestOpenkododTerminalCensus,
  type OpenkododTerminalCensusRequestOptions
} from '../../managed-server/lifecycle/openkodod-terminal-census-client'
import { updateTerminalCounts } from '../../managed-server/activation/openkodod-fenced-stop'
import { tunneledOpenkododPairingCode } from '../../managed-server/lifecycle/openkodod-tunneled-pairing'
import type { StartedPortForward } from '../../ssh/port-forwarding/ssh-port-forward-provider'
import type { OpenkododHostTransport } from '../../managed-server/install/openkodod-host-transport'
import type { WslOpenkododHostTarget } from './wsl-openkodod-host-target'
import { listenWslOpenkododStdioBridge } from './wsl-openkodod-stdio-bridge'

export type WslOpenkododIncumbent = {
  census: OpenkododTerminalCensus
  /** The incumbent's proven readiness; null when it could not be started or proven. */
  readiness: ServeReadiness | null
  /** Recount without wake and close terminal admission before activation stops the incumbent; unreadable never means zero. */
  recount: () => Promise<OpenkododTerminalCensus>
  /** Reopens the admission `recount` closed, when the incumbent keeps running. */
  releaseAdmission: () => Promise<void>
}

type IncumbentArgs = {
  context: OpenkododRemoteContext<WslOpenkododHostTarget>
  slot: OpenkododSlotOptions
  /** This desktop's enrolled pairing; null before its first pairing. */
  paired?: PairingOffer | null
}

const UNREADABLE: WslOpenkododIncumbent = {
  census: UNVERIFIABLE_OPENKODOD_TERMINAL_CENSUS,
  readiness: null,
  recount: async () => UNVERIFIABLE_OPENKODOD_TERMINAL_CENSUS,
  releaseAdmission: async () => {}
}

export type WslOpenkododIncumbentDependencies = {
  wake: typeof wakeStoppedManagedOpenkodod
  probe: typeof probeActiveOpenkododReadiness
  readBuildHash: typeof readRemoteOpenkododBuildHash
  listen: (
    transport: OpenkododHostTransport,
    remotePort: number,
    target: WslOpenkododHostTarget
  ) => Promise<StartedPortForward>
  census: typeof requestOpenkododTerminalCensus
}

const DEFAULT_DEPENDENCIES: WslOpenkododIncumbentDependencies = {
  wake: wakeStoppedManagedOpenkodod,
  probe: probeActiveOpenkododReadiness,
  readBuildHash: readRemoteOpenkododBuildHash,
  listen: (transport, remotePort, target) =>
    listenWslOpenkododStdioBridge(transport, {
      environmentId: target.id,
      distro: target.distro,
      remotePort,
      localPort: 0,
      label: `OpenKodo server in WSL: ${target.label} (update check)`
    }),
  census: requestOpenkododTerminalCensus
}

/** Wake reboot/idle-stopped incumbent, census its daemon, then close the temporary bridge before returning. */
export async function readWslOpenkododIncumbent(
  args: IncumbentArgs,
  dependencies: WslOpenkododIncumbentDependencies = DEFAULT_DEPENDENCIES
): Promise<WslOpenkododIncumbent> {
  const record = args.context.activationRecord
  const activatedAt = record.activatedAt ? Date.parse(record.activatedAt) : Number.NaN
  if (!record.active || !Number.isFinite(activatedAt) || activatedAt < 0) {
    return UNREADABLE
  }
  let readiness: ServeReadiness
  try {
    const wake = await dependencies.wake(args.slot)
    if (wake.outcome === 'started') {
      readiness = wake.readiness
    } else if (wake.outcome === 'serving') {
      const remoteInstallDir = managedOpenkododInstallDir(args.context, record.active)
      readiness = await dependencies.probe(
        { ...args.slot, remoteInstallDir },
        {
          buildHash: await dependencies.readBuildHash(args.slot, remoteInstallDir),
          fullVersion: record.active
        }
      )
    } else {
      return UNREADABLE
    }
  } catch {
    return UNREADABLE
  }
  const counts = updateTerminalCounts((options) =>
    countIncumbentTerminals(args, readiness, activatedAt, dependencies, options)
  )
  return {
    census: await counts.countFirst(),
    readiness,
    recount: counts.recountCensus,
    releaseAdmission: counts.releaseIncumbentAdmission
  }
}

async function countIncumbentTerminals(
  args: IncumbentArgs,
  readiness: ServeReadiness,
  activatedAt: number,
  dependencies: WslOpenkododIncumbentDependencies,
  options: OpenkododTerminalCensusRequestOptions
): Promise<OpenkododTerminalCensus> {
  let forward: StartedPortForward | null = null
  try {
    forward = await dependencies.listen(
      args.slot.conn,
      openkododBoundPort(readiness) ?? OPENKODOD_MANAGED_REMOTE_PORT,
      args.context.target
    )
    // Use enrolled grants; startup offers would enroll a fresh device on every census.
    const offer = parsePairingCode(
      tunneledOpenkododPairingCode(readiness, forward.entry.localPort, args.paired)
    )
    if (!offer) {
      return UNVERIFIABLE_OPENKODOD_TERMINAL_CENSUS
    }
    return await dependencies.census(
      pairedRuntimeConnectionFromOffer(offer),
      activatedAt,
      undefined,
      options
    )
  } catch {
    return UNVERIFIABLE_OPENKODOD_TERMINAL_CENSUS
  } finally {
    await forward?.close().catch(() => {})
  }
}
