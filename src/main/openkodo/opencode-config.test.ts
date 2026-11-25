import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  configureOpenCodeForOpenKodo,
  openCodeConfigPath,
  removeOpenKodoFromOpenCode
} from './opencode-config'

describe('OpenCode provider config', () => {
  beforeEach(async () => {
    process.env.XDG_CONFIG_HOME = await mkdtemp(join(tmpdir(), 'openkodo-config-'))
  })

  it('adds the provider and keeps the existing config', async () => {
    const path = openCodeConfigPath()
    await mkdir(join(path, '..'), { recursive: true })
    await writeFile(path, JSON.stringify({ theme: 'dark', model: 'anthropic/claude' }, null, 2))

    const result = await configureOpenCodeForOpenKodo('ok_live_test')
    expect(result.ok).toBe(true)

    const config = JSON.parse(await readFile(path, 'utf8'))
    expect(config.theme).toBe('dark')
    expect(config.model).toBe('anthropic/claude')
    expect(config.provider.openkodo.options.apiKey).toBe('ok_live_test')
    expect(config.provider.openkodo.options.baseURL).toBe('https://api.openkodo.dev/v1')

    await removeOpenKodoFromOpenCode()
    const cleaned = JSON.parse(await readFile(path, 'utf8'))
    expect(cleaned.provider.openkodo).toBeUndefined()
    expect(cleaned.model).toBe('anthropic/claude')
  })

  it('refuses to rewrite a file it cannot parse', async () => {
    const path = openCodeConfigPath()
    await mkdir(join(path, '..'), { recursive: true })
    await writeFile(path, '{ this is not json')

    const result = await configureOpenCodeForOpenKodo('ok_live_test')
    expect(result.ok).toBe(false)
    expect(await readFile(path, 'utf8')).toBe('{ this is not json')
  })
})
