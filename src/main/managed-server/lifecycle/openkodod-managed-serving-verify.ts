import { resolveEnvironment } from '../../../shared/remote-runtime/host-store/runtime-environment-store'
import type { OpenkododManagedServing } from './openkodod-managed-serving'
import { verifyManagedTunnelServing } from './openkodod-managed-tunnel'

/** Return unverifiable on failures rather than throwing. */
export function verifyOpenkododManagedServing(
  userDataPath: string,
  selector: string
): Promise<OpenkododManagedServing> {
  return Promise.resolve()
    .then(async () => verifyManagedTunnelServing(await resolveEnvironment(userDataPath, selector)))
    .catch((error: unknown) => ({ state: 'unverifiable', detail: String(error) }))
}
