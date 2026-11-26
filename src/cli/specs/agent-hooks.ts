import type { CommandSpec } from '../discovery/command-spec'
import { LOCAL_COMMAND_FLAGS } from '../arguments/args'

export const AGENT_HOOK_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['agent', 'hooks', 'prepare-codex'],
    summary: "Prepare a WSL pane's OpenKodo-managed Codex home before a shell launch",
    usage: 'openkodo agent hooks prepare-codex',
    allowedFlags: [...LOCAL_COMMAND_FLAGS]
  },
  {
    path: ['agent', 'hooks', 'status'],
    summary: 'Show whether OpenKodo-managed agent status hooks are enabled',
    usage: 'openkodo agent hooks status [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS],
    examples: ['openkodo agent hooks status', 'openkodo agent hooks status --json']
  },
  {
    path: ['agent', 'hooks', 'off'],
    summary: 'Disable OpenKodo-managed agent status hooks and remove local hook entries',
    usage: 'openkodo agent hooks off [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS],
    examples: ['openkodo agent hooks off']
  },
  {
    path: ['agent', 'hooks', 'on'],
    summary: 'Enable OpenKodo-managed agent status hooks',
    usage: 'openkodo agent hooks on [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS],
    examples: ['openkodo agent hooks on']
  }
]
