// The one switch for MCP servers in OpenKodo: off until the feature ships. `OPENKODO_MCP_SERVERS=1` turns it
// on for a dev build, orcad or `orca serve`; read on every call so the host's own env decides.
import { McpServersError } from './mcp-servers-error'

export function isMcpServersFeatureEnabled(): boolean {
  return process.env.OPENKODO_MCP_SERVERS === '1'
}

export function assertMcpServersFeatureEnabled(): void {
  if (!isMcpServersFeatureEnabled()) {
    throw new McpServersError('mcp_servers_off', 'MCP servers aren’t turned on for this host.')
  }
}
