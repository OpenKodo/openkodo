import type { CommandSpec } from '../discovery/command-spec'
import { CLI_GLOBAL_FLAGS as GLOBAL_FLAGS } from '../../shared/cli/cli-argument-boundary'

// Separate from `openkodo account` (agent accounts): this is the host's own OpenKodo account.
export const AUTH_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['auth', 'login'],
    summary: "Sign this host's OpenKodo in to your OpenKodo account",
    usage: 'openkodo auth login [--org <id|name>] [--switch] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'org', 'switch'],
    notes: [
      'Prints a link to open in any browser, and a code. Sign in there, check the page shows the same code, and approve; nothing is pasted back.',
      'The running OpenKodo on this host keeps the sign-in; this command never writes it. Start OpenKodo on this host first.',
      '--switch replaces an account that is already signed in. --org picks the organization when you belong to more than one.'
    ],
    examples: [
      'openkodo auth login',
      'openkodo auth login --org Acme',
      'openkodo auth login --switch'
    ]
  },
  {
    path: ['auth', 'status'],
    summary: "Show which OpenKodo account this host's OpenKodo is signed in to",
    usage: 'openkodo auth status [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: ['Exits 0 when signed in and 1 otherwise.'],
    examples: ['openkodo auth status']
  },
  {
    path: ['auth', 'logout'],
    summary: "Sign this host's OpenKodo out of its OpenKodo account",
    usage: 'openkodo auth logout [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    examples: ['openkodo auth logout']
  }
]
