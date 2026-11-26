import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { PluginInstallSource } from '../../../shared/plugins/installation/plugin-install-lockfile'
import {
  installBundledPlugin,
  installPluginFromLocalPath,
  readPluginLockfile
} from './plugin-install'
import { pluginInstallTrustError } from './plugin-install-trust'

const roots: string[] = []

async function tempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix))
  roots.push(root)
  return root
}

async function writePlugin(root: string, publisher: string, id: string): Promise<void> {
  await writeFile(
    join(root, 'openkodo-plugin.json'),
    JSON.stringify({
      manifestVersion: 1,
      id,
      publisher,
      name: 'Plugin',
      version: '1.0.0',
      engines: { orca: '>=1.0.0' },
      pluginApi: 1,
      capabilities: []
    })
  )
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('plugin install trust', () => {
  const official = 'https://github.com/OpenKodo/openkodo-plugins.git'
  const marketplace = (url: string, plugin: string): PluginInstallSource => ({
    kind: 'marketplace',
    marketplace: { url, ref: 'main', resolvedCommit: 'a'.repeat(40) },
    plugin: { url: plugin, ref: 'main' }
  })
  const refused = (key: string): string =>
    `${key} uses a name reserved for official OpenKodo plugins; OpenKodo installs it only from its official catalog`

  it.each<[string, PluginInstallSource, boolean]>([
    [
      'openkodo.secrets',
      marketplace(official, 'git@github.com:OpenKodo/openkodo-secrets.git'),
      true
    ],
    ['openai.tools', marketplace(official, 'https://github.com/OpenKodo/tools.git'), true],
    ['openkodo.secrets', marketplace(official, 'https://github.com/attacker/x.git'), false],
    [
      'openkodo.secrets',
      marketplace(
        'https://github.com/acme/plugins.git',
        'https://github.com/OpenKodo/openkodo-secrets.git'
      ),
      false
    ],
    [
      'openkodo.tools',
      { kind: 'git', url: 'https://github.com/OpenKodo/tools.git', ref: '' },
      false
    ],
    [
      'openkodo-team.tools',
      marketplace('https://gitlab.com/acme/plugins.git', 'https://gitlab.com/acme/t.git'),
      false
    ],
    ['github.tools', { kind: 'git', url: 'https://github.com/acme/t.git', ref: '' }, false],
    ['acme.tools', { kind: 'git', url: 'https://github.com/acme/t.git', ref: '' }, true]
  ])('accepts reserved %s only from the official catalog', (key, source, accepted) => {
    expect(pluginInstallTrustError(key, source)).toBe(accepted ? null : refused(key))
  })

  it('rejects locally installed reserved identities before publication', async () => {
    const sourcePath = await tempRoot('orca-reserved-plugin-')
    const pluginsDir = await tempRoot('orca-plugin-installs-')
    await writePlugin(sourcePath, 'openkodo', 'openkodo-skills')

    await expect(
      installPluginFromLocalPath({ pluginsDir, sourcePath, hostVersion: '1.4.0' })
    ).resolves.toEqual({
      ok: false,
      error: refused('openkodo.openkodo-skills')
    })
    await expect(readPluginLockfile(pluginsDir)).resolves.toEqual({ version: 1, plugins: {} })
  })

  it('allows the app-bundled path only for the complete official identity', async () => {
    const sourcePath = await tempRoot('orca-bundled-plugin-')
    const pluginsDir = await tempRoot('orca-plugin-installs-')
    await writePlugin(sourcePath, 'openkodo', 'openkodo-skills')

    const result = await installBundledPlugin({
      pluginsDir,
      sourcePath,
      hostVersion: '1.4.0',
      expectedPluginKey: 'openkodo.openkodo-skills'
    })

    expect(result).toMatchObject({ ok: true, pluginKey: 'openkodo.openkodo-skills' })
    const lock = await readPluginLockfile(pluginsDir)
    expect(lock.plugins['openkodo.openkodo-skills']?.source).toEqual({
      kind: 'bundled',
      bundleId: 'openkodo.openkodo-skills'
    })
  })

  it('blocks a killed plugin even when the caller bypasses marketplace UI', async () => {
    const sourcePath = await tempRoot('orca-killed-plugin-')
    const pluginsDir = await tempRoot('orca-plugin-installs-')
    await writePlugin(sourcePath, 'community', 'unsafe')

    await expect(
      installPluginFromLocalPath({
        pluginsDir,
        sourcePath,
        hostVersion: '1.4.0',
        blockedPluginReason: (pluginKey) =>
          pluginKey === 'community.unsafe' ? 'Security incident' : null
      })
    ).resolves.toEqual({
      ok: false,
      error: "plugin is blocked by OpenKodo's safety list: Security incident"
    })
  })
})
