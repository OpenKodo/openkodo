import { shell } from 'electron'
import { clearOpenKodoKey, hasOpenKodoKey, readOpenKodoKey, saveOpenKodoKey } from './credentials'
import { configureOpenCodeForOpenKodo, removeOpenKodoFromOpenCode } from './opencode-config'

const BASE = (process.env.OPENKODO_API ?? 'https://openkodo.dev').replace(/\/$/, '')

export type OpenKodoLoginState =
  | { status: 'idle' }
  | { status: 'pending'; userCode: string; verificationUri: string; expiresAt: number }
  | { status: 'connected'; email: string; plan: string; openCodePath: string }
  | { status: 'expired' | 'error'; message: string }

export type OpenKodoUsage = {
  email?: string
  cost_5h_micros: number
  cost_7d_micros: number
  credits_remaining_micros: number
  credits_per_5h_micros: number
  credits_per_week_micros: number
  credits_included_micros: number
  oldest_5h?: string | null
  oldest_7d?: string | null
}

let state: OpenKodoLoginState = { status: 'idle' }
let pollTimer: NodeJS.Timeout | null = null

function stopPolling(): void {
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
}

async function exchange(deviceCode: string): Promise<OpenKodoLoginState> {
  const res = await fetch(`${BASE}/api/desktop/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_code: deviceCode })
  })
  if (res.status === 202) {
    return { status: 'pending', userCode: '', verificationUri: '', expiresAt: 0 }
  }
  if (res.status === 410) {
    return { status: 'expired', message: 'The code expired. Start again.' }
  }
  if (!res.ok) {
    return { status: 'error', message: 'Could not complete sign-in.' }
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the exchange endpoint is ours; missing fields are handled below
  const body = (await res.json()) as {
    api_key?: string
    plan?: string
    models?: { code: string; name: string }[]
    user?: { email?: string }
  }
  if (!body.api_key) {
    return { status: 'error', message: 'Sign-in did not return a key.' }
  }
  await saveOpenKodoKey(body.api_key)
  const configured = await configureOpenCodeForOpenKodo(body.api_key, body.models ?? [])
  return {
    status: 'connected',
    email: body.user?.email ?? '',
    plan: body.plan ?? '',
    openCodePath: configured.ok ? configured.path : ''
  }
}

export async function startOpenKodoLogin(): Promise<OpenKodoLoginState> {
  stopPolling()
  const res = await fetch(`${BASE}/api/desktop/device`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform: process.platform })
  })
  if (!res.ok) {
    state = { status: 'error', message: 'Could not start sign-in. Try again.' }
    return state
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: device-code response from our own API
  const device = (await res.json()) as {
    device_code: string
    user_code: string
    verification_uri: string
    expires_in: number
  }
  state = {
    status: 'pending',
    userCode: device.user_code,
    verificationUri: device.verification_uri,
    expiresAt: Date.now() + device.expires_in * 1000
  }
  void shell.openExternal(device.verification_uri)

  const deadline = Date.now() + device.expires_in * 1000
  const poll = async (): Promise<void> => {
    if (state.status !== 'pending') {
      return
    }
    if (Date.now() > deadline) {
      state = { status: 'expired', message: 'The code expired. Start again.' }
      return
    }
    try {
      const next = await exchange(device.device_code)
      if (next.status === 'pending') {
        pollTimer = setTimeout(() => void poll(), 2500)
        return
      }
      state = next
    } catch {
      pollTimer = setTimeout(() => void poll(), 3000)
    }
  }
  pollTimer = setTimeout(() => void poll(), 2500)
  return state
}

export function getOpenKodoLoginState(): OpenKodoLoginState {
  return state
}

export async function getOpenKodoStatus(): Promise<{
  connected: boolean
  login: OpenKodoLoginState
}> {
  return { connected: await hasOpenKodoKey(), login: state }
}

export async function logoutOpenKodo(): Promise<void> {
  stopPolling()
  state = { status: 'idle' }
  await removeOpenKodoFromOpenCode()
  await clearOpenKodoKey()
}

export async function getOpenKodoUsage(): Promise<OpenKodoUsage | null> {
  const key = await readOpenKodoKey()
  if (!key) {
    return null
  }
  const res = await fetch(`${BASE}/api/plugin/usage`, {
    headers: { Authorization: `Bearer ${key}` }
  })
  if (!res.ok) {
    return null
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: usage payload is produced by our API
  return (await res.json()) as OpenKodoUsage
}

// The OpenCode launch reads this at start: an inline config keeps the key out
// of the user's own opencode.json while pointing every model at OpenKodo.
export async function openKodoOpenCodeConfig(): Promise<string | null> {
  const key = await readOpenKodoKey()
  if (!key) {
    return null
  }
  return JSON.stringify({
    $schema: 'https://opencode.ai/config.json',
    provider: {
      openkodo: {
        npm: '@ai-sdk/openai-compatible',
        name: 'OpenKodo',
        options: { baseURL: 'https://api.openkodo.dev/v1', apiKey: key },
        models: {
          'deepseek-v4-pro-0813': { name: 'DeepSeek V4 Pro 0813' },
          'deepseek-v4.1-flash-1017': { name: 'DeepSeek V4.1 Flash 1017' },
          'deepseek-v4.1-flash-economy': { name: 'DeepSeek V4.1 Flash Eco' }
        }
      }
    },
    model: 'openkodo/deepseek-v4-pro-0813'
  })
}
