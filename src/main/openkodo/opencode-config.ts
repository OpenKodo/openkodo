import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { applyEdits, modify, parse, type ParseError } from 'jsonc-parser'

const CONFIG_MODELS = {
  'deepseek-v4-pro-0813': { name: 'DeepSeek V4 Pro 0813' },
  'deepseek-v4.1-flash-1017': { name: 'DeepSeek V4.1 Flash 1017' },
  'deepseek-v4.1-flash-economy': { name: 'DeepSeek V4.1 Flash Eco' }
}
const DEFAULT_MODEL = 'openkodo/deepseek-v4-pro-0813'

export function openCodeConfigPath(): string {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
  return join(base, 'opencode', 'opencode.json')
}

// Writes the provider into the user's OpenCode config, preserving comments and
// every other key. Refuses to touch a file it cannot parse rather than risking
// a customer's editor configuration.
export async function configureOpenCodeForOpenKodo(
  apiKey: string
): Promise<{ ok: boolean; path: string; error?: string }> {
  const path = openCodeConfigPath()
  await mkdir(dirname(path), { recursive: true })
  let text = '{}'
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: Node fs errors carry code
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      return { ok: false, path, error: 'Could not read the existing OpenCode config.' }
    }
  }
  const errors: ParseError[] = []
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: jsonc-parser returns a JSON value for a single root object
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: same parse, shape checked before use
  const parsed = parse(text, errors, { allowTrailingComma: true }) as
    | Record<string, unknown>
    | undefined
  if (errors.length > 0) {
    return { ok: false, path, error: 'The existing OpenCode config is not valid JSON.' }
  }
  let next = applyEdits(
    text,
    modify(
      text,
      ['provider', 'openkodo'],
      {
        npm: '@ai-sdk/openai-compatible',
        name: 'OpenKodo',
        options: { baseURL: 'https://api.openkodo.dev/v1', apiKey },
        models: CONFIG_MODELS
      },
      { formattingOptions: { insertSpaces: true, tabSize: 2 } }
    )
  )
  if (!parsed || typeof parsed.model !== 'string' || parsed.model.length === 0) {
    next = applyEdits(
      next,
      modify(next, ['model'], DEFAULT_MODEL, {
        formattingOptions: { insertSpaces: true, tabSize: 2 }
      })
    )
  }
  await writeFile(path, next)
  return { ok: true, path }
}

export async function removeOpenKodoFromOpenCode(): Promise<void> {
  const path = openCodeConfigPath()
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch {
    return
  }
  const errors: ParseError[] = []
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: jsonc-parser returns a JSON value for a single root object
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: same parse, shape checked before use
  const parsed = parse(text, errors, { allowTrailingComma: true }) as
    | Record<string, unknown>
    | undefined
  if (errors.length > 0) {
    return
  }
  let next = applyEdits(text, modify(text, ['provider', 'openkodo'], undefined, {}))
  const model = parsed?.model
  if (typeof model === 'string' && model.startsWith('openkodo/')) {
    next = applyEdits(next, modify(next, ['model'], undefined, {}))
  }
  await writeFile(path, next)
}
