import { NODE_RUNTIME_PIN } from '../../node-runtime/node-runtime-pin'
import type { OpenkododPreflightRuntimeIdentity } from './openkodod-profile-preflight'

/** What a Node slot's candidate must report: the pinned runtime, never a host Node. */
export const OPENKODOD_NODE_RUNTIME_IDENTITY: OpenkododPreflightRuntimeIdentity = {
  runtime: 'node',
  runtimeVersion: NODE_RUNTIME_PIN.version
}
