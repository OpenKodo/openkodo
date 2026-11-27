import { join } from 'node:path'
import { getProfileUserDataPath } from '../openkodo-profiles/profile-storage-paths'

/** `<userData>/mcp-servers`; the host's MCP list is `.openkodo/bot-tools.json` inside, as in a bot's home. */
export const mcpHostListFolder = (): string => join(getProfileUserDataPath(), 'mcp-servers')
