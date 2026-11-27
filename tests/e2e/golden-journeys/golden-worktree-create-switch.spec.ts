import { removeWorktreeViaStore } from '../terminal/input/dead-terminal'
import { openSidebarWorkspaceComposer } from '../workspaces/sidebar/sidebar-project-dialog'
import { dismissSetupScriptPrompts } from '../workspaces/sidebar/sidebar-setup-prompt'
import type { Page } from '@playwright/test'
import { test } from '../desktop/electron-fixtures/openkodo-app'
import { expect } from '@playwright/test'
import {
  ensureTerminalVisible,
  getActiveWorktreeId,
  waitForActiveWorktree,
  waitForSessionReady
} from '../desktop/renderer-probes/store'
import { createTerminalTabFromMenu } from '../terminal/layout/terminal-tab-menu'
import { waitForActivePanePtyId } from '../terminal/input/terminal'
import {
  execInTerminal,
  waitForActiveTerminalManager,
  waitForTerminalOutput
} from '../terminal/layout/terminal-pane-operations'
import { splitMarkerEchoCommand } from '../terminal/input/terminal-marker-echo-command'
import { waitForPtyShellEcho } from '../terminal/lifecycle/terminal-pty-readiness'

async function createWorkspace(page: Page, name: string): Promise<void> {
  await openSidebarWorkspaceComposer(page)
  const dialog = page.getByRole('dialog', { name: /Create (Workspace|Worktree)/i })
  await expect(dialog).toBeVisible()
  await dialog.getByPlaceholder(/Type a name/i).fill(name)
  await dialog.getByRole('button', { name: /Create (Workspace|Worktree)/i }).click()
  await expect(dialog).toBeHidden({ timeout: 20_000 })
}

test('creates a worktree, keeps its terminal isolated, and switches back @golden', async ({
  openkodoPage
}) => {
  test.setTimeout(180_000)
  await waitForSessionReady(openkodoPage)
  await dismissSetupScriptPrompts(openkodoPage)
  const originalWorktreeId = await waitForActiveWorktree(openkodoPage)
  await waitForActiveTerminalManager(openkodoPage, 30_000)
  const parentPtyId = await waitForActivePanePtyId(openkodoPage)
  const workspaceName = `golden-switch-${Date.now()}`
  let childWorktreeId: string | null = null

  try {
    await createWorkspace(openkodoPage, workspaceName)
    await expect(
      openkodoPage
        .locator('[role="option"][aria-current="page"]')
        .filter({ hasText: workspaceName })
    ).toBeVisible({ timeout: 30_000 })
    childWorktreeId = await waitForActiveWorktree(openkodoPage)
    // Why: the cleanup force-removes childWorktreeId, so it must never resolve to the original.
    expect(childWorktreeId).not.toBe(originalWorktreeId)
    await expect(
      openkodoPage.locator(`[role="option"][data-worktree-id="${childWorktreeId}"]`)
    ).toHaveAttribute('aria-current', 'page')

    await createTerminalTabFromMenu(openkodoPage)
    await waitForActiveTerminalManager(openkodoPage, 30_000)
    const childPtyId = await waitForActivePanePtyId(openkodoPage)
    expect(childPtyId).not.toBe(parentPtyId)
    await waitForPtyShellEcho(openkodoPage, childPtyId, 15_000)
    await execInTerminal(openkodoPage, childPtyId, splitMarkerEchoCommand('worktree', '-b'))
    await waitForTerminalOutput(openkodoPage, 'worktree-b')

    await openkodoPage.locator(`[role="option"][data-worktree-id="${originalWorktreeId}"]`).click()
    await expect(
      openkodoPage.locator(`[role="option"][data-worktree-id="${originalWorktreeId}"]`)
    ).toHaveAttribute('aria-current', 'page', { timeout: 20_000 })
    // Wait for store activation too: sidebar aria-current can precede the child terminal’s manager remount.
    await expect
      .poll(() => getActiveWorktreeId(openkodoPage), {
        timeout: 20_000,
        message: 'store did not activate the original worktree after sidebar click'
      })
      .toBe(originalWorktreeId)
    await ensureTerminalVisible(openkodoPage)
    await waitForActiveTerminalManager(openkodoPage, 30_000)
    expect(await waitForActivePanePtyId(openkodoPage, 30_000)).toBe(parentPtyId)
  } finally {
    if (childWorktreeId) {
      if ((await getActiveWorktreeId(openkodoPage).catch(() => null)) !== originalWorktreeId) {
        await openkodoPage
          .locator(`[role="option"][data-worktree-id="${originalWorktreeId}"]`)
          .click()
          .catch(() => undefined)
      }
      await removeWorktreeViaStore(openkodoPage, childWorktreeId)
    }
  }
})
