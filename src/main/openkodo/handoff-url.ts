const PREFIX = 'openkodo://connect'

/** Extract the handoff code from an openkodo://connect?code=... URL. */
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
