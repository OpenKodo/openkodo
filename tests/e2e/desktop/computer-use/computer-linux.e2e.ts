import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import type {
  ComputerActionResult,
  ComputerListWindowsResult,
  ComputerSnapshotResult
} from '../../../../src/shared/computer/computer-use-runtime-types'
import { ensureGeditLaunched, findRoleIndex, killGedit, openGeditWindow } from './computer-driver'
import {
  ensureOpenKodoRuntimeLaunched,
  parseJsonOutput,
  runOpenKodoCli
} from './computer-cli-driver'

const isLinux = process.platform === 'linux'
const e2eOptIn = process.env.OPENKODO_COMPUTER_E2E === '1'

// Why: gedit's first text node is its hidden, read-only overview map; the editor sits in a scroll pane.
const GEDIT_TEXT_ROLE =
  /^\s*\d+\s+scroll pane[^\n]*\n\s*(\d+)\s+(?:text|document|edit area)(?:\s|$)/im

async function geditState(windowArgs: string[], restore: boolean): Promise<ComputerSnapshotResult> {
  return parseJsonOutput<{ result: ComputerSnapshotResult }>(
    (
      await runOpenKodoCli([
        'computer',
        'get-app-state',
        '--app',
        'gedit',
        ...windowArgs,
        ...(restore ? ['--restore-window'] : []),
        '--no-screenshot',
        '--json'
      ])
    ).stdout
  ).result
}

async function focusGeditDocument(windowArgs: string[] = []): Promise<void> {
  const before = await geditState(windowArgs, true)
  const textIndex = findRoleIndex(before.snapshot.treeText, GEDIT_TEXT_ROLE)
  expect(textIndex).toBeGreaterThanOrEqual(0)

  await runOpenKodoCli([
    'computer',
    'click',
    '--app',
    'gedit',
    ...windowArgs,
    '--element-index',
    String(textIndex),
    '--restore-window',
    '--no-screenshot',
    '--json'
  ])
}

async function geditWindowArgs(title: string): Promise<string[]> {
  const listed = parseJsonOutput<{ result: ComputerListWindowsResult }>(
    (await runOpenKodoCli(['computer', 'list-windows', '--app', 'gedit', '--json'])).stdout
  )
  const window = listed.result.windows.find((candidate) => candidate.title.includes(title))
  expect(window).toBeDefined()
  return ['--window-index', String(window!.index)]
}

describe.skipIf(!isLinux || !e2eOptIn)('computer-use Linux e2e (gedit)', () => {
  beforeAll(async () => {
    await ensureOpenKodoRuntimeLaunched()
    await ensureGeditLaunched()
  })

  afterAll(async () => {
    await killGedit()
  })

  test('paste-text mutates the test-owned document', async () => {
    await focusGeditDocument()

    const marker = `openkodo-linux-paste-${Date.now()}-café-🚀`
    const action = parseJsonOutput<{ result: ComputerActionResult }>(
      (
        await runOpenKodoCli([
          'computer',
          'paste-text',
          '--app',
          'gedit',
          '--text',
          marker,
          '--restore-window',
          '--no-screenshot',
          '--json'
        ])
      ).stdout
    )
    expect(action.result.action?.path).toBe('accessibility')
    expect(action.result.action?.verification).toMatchObject({
      state: 'verified',
      property: 'focusedText'
    })

    const after = parseJsonOutput<{ result: ComputerSnapshotResult }>(
      (
        await runOpenKodoCli([
          'computer',
          'get-app-state',
          '--app',
          'gedit',
          '--no-screenshot',
          '--json'
        ])
      ).stdout
    )
    expect(after.result.snapshot.treeText).toContain(marker)
  })

  test('type-text --element-index inserts into a background window field without focusing it', async () => {
    await openGeditWindow('gedit-front.txt')
    const targetWindow = await geditWindowArgs('gedit-target.txt')
    const frontWindow = await geditWindowArgs('gedit-front.txt')
    await focusGeditDocument(frontWindow)

    const target = await geditState(targetWindow, false)
    const documentIndex = findRoleIndex(target.snapshot.treeText, GEDIT_TEXT_ROLE)
    expect(documentIndex).toBeGreaterThanOrEqual(0)

    const marker = `openkodo-linux-element-${Date.now()}-élan-🚀`
    const typed = parseJsonOutput<{ result: ComputerActionResult }>(
      (
        await runOpenKodoCli([
          'computer',
          'type-text',
          '--app',
          'gedit',
          ...targetWindow,
          '--element-index',
          String(documentIndex),
          '--text',
          marker,
          '--no-screenshot',
          '--full-tree',
          '--json'
        ])
      ).stdout
    )
    expect(typed.result.action).toMatchObject({
      path: 'accessibility',
      verification: { state: 'verified', property: 'elementText' }
    })
    expect(typed.result.snapshot.treeText).toContain(marker)
    expect((await geditState(frontWindow, false)).snapshot.treeText).not.toContain(marker)
  })
})
