import type { NodeRuntimeTarget } from '../../../shared/node-runtime/node-runtime-pin'
import { resolveOpenkododDeploymentTargetFacts } from '../install/openkodod-deployment-target'
import { OpenkododHostUnsupportedError } from '../../openkodod/diagnostics/openkodod-host-unavailable'
import type { OpenkododHostTransport } from '../install/openkodod-host-transport'
import { pinnedRuntimeTargetForHost } from '../install/pinned-runtime-host-target'
import type { RemoteHostPlatform } from '../../ssh/remote-host/ssh-remote-platform'

/** Lets a caller that knows the host kind add its own fix; the message is the one SSH shows. */
export class OpenkododHostGlibcUnsupportedError extends OpenkododHostUnsupportedError {
  constructor(target: string, glibc: string) {
    super(`No OpenKodo runtime supports ${target} with glibc ${glibc}.`)
  }
}

export async function resolveOpenkododRuntimeTarget(options: {
  conn: OpenkododHostTransport
  host: RemoteHostPlatform
  signal?: AbortSignal
  exec?: (command: string) => Promise<string>
}): Promise<NodeRuntimeTarget> {
  const facts = await resolveOpenkododDeploymentTargetFacts(options)
  const target = pinnedRuntimeTargetForHost(facts)
  if (!target) {
    const glibc = facts.glibc ? `${facts.glibc.major}.${facts.glibc.minor}` : 'unknown'
    throw new OpenkododHostGlibcUnsupportedError(facts.target, glibc)
  }
  return target
}
