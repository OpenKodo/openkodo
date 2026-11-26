import { OPENKODO_AGENT_SESSION_ID_ENV } from '../../../../shared/agent-session/lifecycle/launch/agent-session-caller-env'
import { OPENKODO_STRUCTURED_SESSION_ENV } from '../../../../shared/agent-launch/environment/structured-session-marker'
import {
  OPENKODO_SCRUB_SAFE_LAUNCH_ENV,
  OPENKODO_SCRUB_SAFE_PANE_ENV
} from '../../../../shared/agent-hook-listener/transport/agent-hook-scrub-safe-env'

export const AGENT_HOOK_RUNTIME_ENV_KEYS = [
  'OPENKODO_AGENT_HOOK_PORT',
  'OPENKODO_AGENT_HOOK_TOKEN',
  'OPENKODO_AGENT_HOOK_ENV',
  'OPENKODO_AGENT_HOOK_VERSION',
  'OPENKODO_AGENT_HOOK_TRANSPORT',
  'OPENKODO_AGENT_HOOK_ENDPOINT',
  // Remove the reverted inherited path still present in older PTYs (#2778).
  'OPENKODO_CLAUDE_AGENT_STATUS_SETTINGS'
] as const

export const AGENT_PANE_HOOK_ENV_KEYS = [
  'OPENKODO_PANE_KEY',
  'OPENKODO_TAB_ID',
  'OPENKODO_WORKTREE_ID',
  'OPENKODO_AGENT_LAUNCH_TOKEN',
  OPENKODO_SCRUB_SAFE_PANE_ENV,
  OPENKODO_SCRUB_SAFE_LAUNCH_ENV,
  ...AGENT_HOOK_RUNTIME_ENV_KEYS
] as const

// Inherited structured-session IDs would make every pane claim the parent orchestration caller.
export const OPENKODO_AGENT_SESSION_CALLER_ENV_KEYS = [
  OPENKODO_AGENT_SESSION_ID_ENV,
  OPENKODO_STRUCTURED_SESSION_ENV
] as const
