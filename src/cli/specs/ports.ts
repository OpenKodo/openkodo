import type { CommandSpec } from '../discovery/command-spec'
import { CLI_GLOBAL_FLAGS as GLOBAL_FLAGS } from '../../shared/cli/cli-argument-boundary'

export const PORTS_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['ports'],
    summary: 'List the listening ports OpenKodo detected for a workspace',
    usage: 'openkodo ports [--worktree <selector>] [--all] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree', 'all'],
    notes: [
      'Defaults to the OpenKodo workspace that contains the current directory.',
      'Scans the host the workspace runs on and lists the ports OpenKodo tied to it, by process working directory (match=cwd) or command line (match=command).',
      '--all lists every listener found on that host, including other workspaces and processes OpenKodo could not tie to one. A native folder workspace needs --all, because OpenKodo does not tie ports to folders.',
      'url is the address the dev server printed in an OpenKodo terminal; it is missing when OpenKodo did not see one.'
    ],
    examples: [
      'openkodo ports',
      'openkodo ports --worktree branch:feature/login --json',
      'openkodo ports --all',
      "openkodo ports --json | jq -r '.result.ports[0].advertisedUrl'"
    ]
  }
]
