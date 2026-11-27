/** Injected session identity resolves the orchestration caller without guessing a terminal. Valid only on the same host/user: refuse claims across SSH, pairing or WSL, and omit it from SSH passthrough. */
import { OPENKODO_SESSION_ADDRESS_PREFIX } from '../../identity/openkodo-session-address-prefix'
import { isStructuredWorkerHandle } from '../../../orchestration/workers/structured-worker-handle'

export const OPENKODO_AGENT_SESSION_ID_ENV = 'OPENKODO_AGENT_SESSION_ID'

/** The reservation token distinguishes its live child from a process that reused the PID. */
export const OPENKODO_AGENT_SESSION_SPAWN_TOKEN_ENV = 'OPENKODO_AGENT_SESSION_SPAWN_TOKEN'

/** Set per session by a tool process several chats share, which can't carry any one chat's identity:
 *  OpenKodo's CLI trades it with this host for that session's identity once per command. */
export const OPENKODO_AGENT_SESSION_TOOL_TOKEN_ENV = 'OPENKODO_AGENT_SESSION_TOOL_TOKEN'

/** Where OpenKodo publishes each session of a shared tool process: the variable that names the tool's
 *  session, the process's home (and its default) and the folder under it. A bot's file says so, so
 *  OpenKodo's CLI refuses a bot's tool whose token never arrived instead of running it as the owner. */
export const SHARED_TOOL_PROCESS_SESSION_FILES = [
  {
    // A delegated subagent and the rest of a compressed turn get a new session id; the chat id stays.
    sessionIdEnvs: ['HERMES_SESSION_ID', 'HERMES_SESSION_CHAT_ID'],
    homeEnv: 'HERMES_HOME',
    defaultHome: '.hermes',
    dir: 'openkodo-sessions'
  }
] as const
/** The session ids OpenKodo writes and reads as file names. */
export const SHARED_TOOL_PROCESS_SESSION_ID_PATTERN = '[A-Za-z0-9_-][A-Za-z0-9_.-]{0,199}'
/** Set in a bot session's published file; never an environment name, so it is never injected. */
export const SHARED_TOOL_PROCESS_BOT_FIELD = 'openkodoBot'

/** A bot run's key to OpenKodo's bot tool relay; the host names the calling bot by it, never by the session id. */
export const BOT_TOOLS_TOKEN_ENV = 'OPENKODO_BOT_TOOLS_TOKEN'

/** A non-bot session's key to the relay for its host's MCP servers; it names no bot. */
export const MCP_TOKEN_ENV = 'OPENKODO_MCP_TOKEN'

/** What names the calling chat or bot: a process other chats share must never carry one chat's. */
export const CALLER_IDENTITY_ENV: readonly string[] = [
  OPENKODO_AGENT_SESSION_ID_ENV,
  'OPENKODO_TERMINAL_HANDLE',
  BOT_TOOLS_TOKEN_ENV,
  MCP_TOKEN_ENV
]

export function readInjectedBotToken(
  env: Readonly<Record<string, string | undefined>> = process.env
): string | undefined {
  const value = env[BOT_TOOLS_TOKEN_ENV]?.trim()
  return value ? value : undefined
}

export function readInjectedAgentSessionId(
  env: Readonly<Record<string, string | undefined>> = process.env
): string | undefined {
  const value = env[OPENKODO_AGENT_SESSION_ID_ENV]?.trim()
  return value ? value : undefined
}

/** Match the resolved host mailbox address: workers retain their minted handle; other sessions use openkodo_session_id:<id>. The CLI cannot call the host resolver. */
export function injectedSessionAddress(
  env: Readonly<Record<string, string | undefined>> = process.env
): string | undefined {
  const sessionId = readInjectedAgentSessionId(env)
  if (!sessionId) {
    return undefined
  }
  const ownHandle = env.OPENKODO_TERMINAL_HANDLE
  return isStructuredWorkerHandle(ownHandle)
    ? ownHandle
    : `${OPENKODO_SESSION_ADDRESS_PREFIX}${sessionId}`
}
