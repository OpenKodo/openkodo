export type OpenkododTunnelTransport = 'tcp_forward' | 'stdio_bridge'

const transports = new Map<string, OpenkododTunnelTransport>()

export function rememberOpenkododTunnelTransport(
  targetId: string,
  transport: OpenkododTunnelTransport
): void {
  transports.set(targetId, transport)
}

export function knownOpenkododTunnelTransport(targetId: string): OpenkododTunnelTransport | null {
  return transports.get(targetId) ?? null
}
