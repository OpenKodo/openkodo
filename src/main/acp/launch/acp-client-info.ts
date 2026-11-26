import type { Implementation } from '../generated/acp-protocol.generated'
import type { AcpLaunchSpec } from './acp-launch-contract'

export const OPENKODO_ACP_CLIENT_INFO: Implementation = { name: 'orca', version: '1' }

/** The identity initialize sends to a spec's agent at the launched version. */
export function acpClientInfo(
  spec: Pick<AcpLaunchSpec, 'clientInfo'>,
  version: string | null,
  fallback: Implementation = OPENKODO_ACP_CLIENT_INFO
): Implementation {
  return spec.clientInfo?.(version) ?? fallback
}
