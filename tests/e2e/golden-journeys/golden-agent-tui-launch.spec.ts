import { test } from '../desktop/electron-fixtures/openkodo-app'
import { expect } from '@playwright/test'
import {
  configureGoldenStubAgent,
  getGoldenStubAgentLaunchEnv,
  launchGoldenStubAgentFromNewTab
} from './golden-stub-agent'
import {
  ensureTerminalVisible,
  waitForActiveWorktree,
  waitForSessionReady
} from '../desktop/renderer-probes/store'
import { focusActiveTerminalInput } from '../terminal/input/terminal'
import { getTerminalContent } from '../terminal/layout/terminal-pane-identity'

test.use({ launchEnv: getGoldenStubAgentLaunchEnv() })

test('launches an agent TUI with a live multiline composer', async ({ openkodoPage }) => {
  await waitForSessionReady(openkodoPage)
  await waitForActiveWorktree(openkodoPage)
  await ensureTerminalVisible(openkodoPage)
  await configureGoldenStubAgent(openkodoPage)
  await launchGoldenStubAgentFromNewTab(openkodoPage)

  const activeTab = openkodoPage.locator('[data-testid="sortable-tab"][data-active="true"]')
  await expect(activeTab).toHaveAttribute('data-tab-title', /Codex|Golden Stub Agent/i)

  await focusActiveTerminalInput(openkodoPage)
  await openkodoPage.keyboard.type('hello from e2e')
  await openkodoPage.keyboard.press('Shift+Enter')
  await openkodoPage.keyboard.type('second line')

  await expect
    .poll(() => getTerminalContent(openkodoPage), { timeout: 10_000 })
    .toContain('> hello from e2e\r\n  second line')
  expect(await getTerminalContent(openkodoPage)).not.toContain('GOLDEN_STUB_AGENT_SUBMITTED')
})
