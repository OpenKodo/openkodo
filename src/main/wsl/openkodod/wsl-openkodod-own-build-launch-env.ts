import { hostMallocTunablesLaunchEnv } from '../../memory/host-malloc-tunables'
import type { OpenkododHostTransport } from '../../managed-server/install/openkodod-host-transport'

/** An older slot would leak GLIBC_TUNABLES to user shells, so only this build's own slot gets it. */
export function withOwnBuildLaunchEnv<T extends OpenkododHostTransport>(
  conn: T,
  ownBuildVersion: () => string | null
): T {
  const openkododLaunchEnv: OpenkododHostTransport['openkododLaunchEnv'] = async (launch) => [
    ...((await conn.openkododLaunchEnv?.(launch)) ?? []),
    ...(launch.fullVersion === ownBuildVersion() ? hostMallocTunablesLaunchEnv() : [])
  ]
  // Delegate rather than spread so prototype methods survive; #private fields would still need explicit forwarding.
  return Object.create(conn, { openkododLaunchEnv: { value: openkododLaunchEnv } })
}
