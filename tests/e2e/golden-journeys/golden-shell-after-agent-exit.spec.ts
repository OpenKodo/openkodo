import { test } from '../desktop/electron-fixtures/openkodo-app'
import { expect } from '@playwright/test'
import {
  configureGoldenStubAgent,
  getGoldenStubAgentLaunchEnv,
  GOLDEN_STUB_EXIT_MARKER,
  launchGoldenStubAgentFromNewTab
} from './golden-stub-agent'
import {
  ensureTerminalVisible,
  waitForActiveWorktree,
  waitForSessionReady
} from '../desktop/renderer-probes/store'
import { waitForRestoredTerminalInputReady } from '../terminal/readiness/restored-terminal-input-readiness'
import { focusActiveTerminalInput, waitForActivePanePtyId } from '../terminal/input/terminal'
import { waitForTerminalOutput } from '../terminal/layout/terminal-pane-operations'

test.use({ launchEnv: getGoldenStubAgentLaunchEnv() })

// Split the marker so terminal input echo cannot impersonate successful shell execution.
function buildSplitMarkerEcho(prefix: string, suffix: string): { command: string; marker: string } {
  const command =
    process.platform === 'win32'
      ? `Write-Output ('${prefix}' + '${suffix}')`
      : `echo "${prefix}""${suffix}"`
  return { command, marker: `${prefix}${suffix}` }
}

test('opens a clean live shell after an agent exits', async ({ openkodoPage }) => {
  await waitForSessionReady(openkodoPage)
  await waitForActiveWorktree(openkodoPage)
  await ensureTerminalVisible(openkodoPage)
  await configureGoldenStubAgent(openkodoPage)
  await launchGoldenStubAgentFromNewTab(openkodoPage)

  await openkodoPage.keyboard.type('exit')
  await openkodoPage.keyboard.press('Enter')
  await waitForTerminalOutput(openkodoPage, GOLDEN_STUB_EXIT_MARKER, 15_000)

  const tabsBeforeShell = await openkodoPage.locator('[data-testid="sortable-tab"]').count()
  await openkodoPage.getByRole('button', { name: 'New tab' }).click({ force: true })
  await openkodoPage
    .getByRole('menu')
    .getByRole('button', { name: /New Terminal/i })
    .first()
    .click({ force: true })
  await expect(openkodoPage.locator('[data-testid="sortable-tab"]')).toHaveCount(
    tabsBeforeShell + 1
  )
  const shellPtyId = await waitForActivePanePtyId(openkodoPage)
  // A bound pane can precede transport readiness; wait or marker keystrokes may be dropped.
  expect(await waitForRestoredTerminalInputReady(openkodoPage, shellPtyId)).toBe(true)

  const afterAgent = buildSplitMarkerEcho('after-', 'agent')
  await focusActiveTerminalInput(openkodoPage)
  await openkodoPage.keyboard.type(afterAgent.command)
  await openkodoPage.keyboard.press('Enter')
  await waitForTerminalOutput(openkodoPage, afterAgent.marker, 15_000)

  const afterShiftEnter = buildSplitMarkerEcho('after-shift-', 'enter')
  await openkodoPage.keyboard.press('Shift+Enter')
  await openkodoPage.keyboard.type(afterShiftEnter.command)
  await openkodoPage.keyboard.press('Enter')
  await waitForTerminalOutput(openkodoPage, afterShiftEnter.marker, 15_000)
  await expect(openkodoPage.locator('[data-testid="sortable-tab"]')).toHaveCount(
    tabsBeforeShell + 1
  )
})
