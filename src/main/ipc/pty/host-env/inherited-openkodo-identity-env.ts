// Who an OpenKodo child is: its terminal, pane, chat session, launch, hook channel, bot, agent team, host
// stamp and remote target. Each child gets these from the OpenKodo that starts it. A host process (the
// desktop app, Electron serve, openkodod, the terminal daemon) is never such a child itself, so any copy it
// inherited names a terminal or agent of whichever OpenKodo launched it, and a child holding it could pass
// as that owner terminal.
import {
  BOT_TOOLS_TOKEN_ENV,
  MCP_TOKEN_ENV,
  OPENKODO_AGENT_SESSION_SPAWN_TOKEN_ENV,
  OPENKODO_AGENT_SESSION_TOOL_TOKEN_ENV
} from '../../../../shared/agent-session/lifecycle/launch/agent-session-caller-env'
import {
  ORCHESTRATION_COMPATIBILITY_ATTACHMENT_ENV,
  ORCHESTRATION_COMPATIBILITY_HOST_ID_ENV,
  ORCHESTRATION_COMPATIBILITY_HOST_INCARNATION_ENV,
  ORCHESTRATION_COMPATIBILITY_HOST_KIND_ENV
} from '../../../../shared/orchestration/orchestration-compatibility-evidence'
import { AGENT_PANE_HOOK_ENV_KEYS, OPENKODO_AGENT_SESSION_CALLER_ENV_KEYS } from './spawn-env-keys'

/** Which runtime the `openkodo` CLI targets; an inherited one points a child's CLI at another OpenKodo. */
export const REMOTE_RUNTIME_SELECTOR_ENV_KEYS = [
  'OPENKODO_ENVIRONMENT',
  'OPENKODO_PAIRING_CODE',
  'OPENKODO_REMOTE_PAIRING'
] as const

/** Set on an agent-teams leader pane (claude-agent-teams-service.ts). */
export const AGENT_TEAMS_TEAM_ID_ENV = 'OPENKODO_AGENT_TEAMS_TEAM_ID'

export const INHERITED_OPENKODO_IDENTITY_ENV_KEYS = [
  'OPENKODO_TERMINAL_HANDLE',
  ...AGENT_PANE_HOOK_ENV_KEYS,
  ...OPENKODO_AGENT_SESSION_CALLER_ENV_KEYS,
  OPENKODO_AGENT_SESSION_SPAWN_TOKEN_ENV,
  OPENKODO_AGENT_SESSION_TOOL_TOKEN_ENV,
  // A pane's workspace scope (terminal-workspace-scope.ts).
  'OPENKODO_WORKSPACE_ID',
  'OPENKODO_PROJECT_GROUP_ID',
  'OPENKODO_WORKSPACE_ROOT',
  BOT_TOOLS_TOKEN_ENV,
  MCP_TOKEN_ENV,
  ...REMOTE_RUNTIME_SELECTOR_ENV_KEYS,
  AGENT_TEAMS_TEAM_ID_ENV,
  'OPENKODO_AGENT_TEAMS_TOKEN',
  'OPENKODO_AGENT_TEAMS_LEADER_PANE',
  'OPENKODO_AGENT_TEAMS_SHIM_DIR',
  // A WSL pane's host stamp (wsl-openkodo-env.ts).
  ORCHESTRATION_COMPATIBILITY_HOST_KIND_ENV,
  ORCHESTRATION_COMPATIBILITY_HOST_ID_ENV,
  ORCHESTRATION_COMPATIBILITY_HOST_INCARNATION_ENV,
  ORCHESTRATION_COMPATIBILITY_ATTACHMENT_ENV
] as const

/** Also a user's own override (claude-agent-teams-shim-env.ts), so dropped only beside a team's id. */
export const INHERITED_OPENKODO_TEAM_ENV_KEYS = ['OPENKODO_AGENT_TEAMS_SHIM_BIN'] as const

/** Run by each host process before it starts any child, so every spawn path starts from a clean env.
 *  The built Electron main runs the same drop from its banner (config/build-plugins). */
export function dropInheritedOpenKodoIdentityEnv(env: NodeJS.ProcessEnv = process.env): void {
  if (env[AGENT_TEAMS_TEAM_ID_ENV]) {
    for (const key of INHERITED_OPENKODO_TEAM_ENV_KEYS) {
      delete env[key]
    }
  }
  for (const key of INHERITED_OPENKODO_IDENTITY_ENV_KEYS) {
    delete env[key]
  }
}
