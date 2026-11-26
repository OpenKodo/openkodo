import { completeOpenKodoHandoff } from './login'

const PREFIX = 'orca://openkodo/connect'

/** Extract the handoff code from an orca://openkodo/connect?code=... URL. */
export function openKodoHandoffCode(value: string): string | null {
  if (!value.startsWith(PREFIX)) {
    return null
  }
  try {
    const code = new URL(value).searchParams.get('code')
    return code && code.length > 10 ? code : null
  } catch {
    return null
  }
}

/** Windows and Linux deliver protocol URLs inside the second instance's argv. */
export function openKodoHandoffFromArgs(args: readonly string[]): string | null {
  for (const arg of args) {
    const code = openKodoHandoffCode(arg)
    if (code) {
      return code
    }
  }
  return null
}

/** Returns true when the URL belonged to us and the exchange ran. */
export async function completeOpenKodoProtocol(value: string): Promise<boolean> {
  const code = openKodoHandoffCode(value)
  if (!code) {
    return false
  }
  await completeOpenKodoHandoff(code)
  return true
}
