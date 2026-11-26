import { describe, expect, it } from 'vitest'

import { computeCodexTrustedHash as computeTrustedHash } from '../identity/codex-trust-identity'
import type { CodexTrustEntry } from '../toml/config-toml-trust'

// Frozen form-1 fixture: codex-cli 0.159.3 hooks/list reported this Interrupt hash with timeout 3.
const OPENKODO_FORM_1_COMMAND =
  ': openkodo-agent-hook-form=1; if [ -n "${OPENKODO_PANE_KEY-}" ] && [ -n "${OPENKODO_AGENT_HOOK_ROOT-}" ] && [ -f "${OPENKODO_AGENT_HOOK_ROOT-}/agent-hooks/codex-hook.sh" ]; then /bin/sh "${OPENKODO_AGENT_HOOK_ROOT-}/agent-hooks/codex-hook.sh" || :; elif [ -z "${OPENKODO_AGENT_HOOK_ROOT-}" ] && [ -n "${OPENKODO_PANE_KEY-}" ] && [ -n "${OPENKODO_AGENT_HOOK_PORT-}" ] && [ -f "${HOME-}/.openkodo/agent-hooks/codex-hook.sh" ]; then /bin/sh "${HOME-}/.openkodo/agent-hooks/codex-hook.sh" || :; else { command -p cat 2>/dev/null || cat; } >/dev/null 2>&1 || :; fi'
const REAL_INTERRUPT_HASH =
  'sha256:26ef3aa7abe008ccbf3ae3616bb56648c03889f6b653259a8cb1a4242c9ec1f2'

const INTERRUPT_ENTRY: CodexTrustEntry = {
  sourcePath: '/home/dev/.codex/hooks.json',
  eventLabel: 'interrupt',
  groupIndex: 0,
  handlerIndex: 0,
  command: OPENKODO_FORM_1_COMMAND,
  timeoutSec: 3
}

describe('the managed Codex Interrupt hook', () => {
  it('reproduces the hash real Codex computed for the Interrupt hook', () => {
    expect(computeTrustedHash(INTERRUPT_ENTRY)).toBe(REAL_INTERRUPT_HASH)
  })
})

// Frozen from codex-cli 0.162.1 and 0.170.0 hooks/list for this command.
const PROBE_COMMAND = 'node -e "process.exit(0)"'

describe('the SessionEnd hook', () => {
  it.each<
    [string, Omit<CodexTrustEntry, 'sourcePath' | 'groupIndex' | 'handlerIndex' | 'command'>]
  >([
    [
      'sha256:9a8e5508f1534981f66caf8ad29fe27d669188ee71e2d6e3ef56d8e65390f578',
      { eventLabel: 'session_end' }
    ],
    [
      'sha256:b4f5513d145df2d6d400f79b73a8f6e1a4eaa96484fbe4b793e802d7906e9e02',
      { eventLabel: 'session_end', matcher: 'other', timeoutSec: 9 }
    ]
  ])('reproduces the hash real Codex computed (%s)', (hash, entry) => {
    expect(
      computeTrustedHash({
        sourcePath: '/home/dev/.codex/hooks.json',
        groupIndex: 0,
        handlerIndex: 0,
        command: PROBE_COMMAND,
        ...entry
      })
    ).toBe(hash)
  })
})
