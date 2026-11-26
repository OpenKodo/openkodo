import { completeOpenKodoHandoff } from './login'
import { openKodoHandoffCode } from './handoff-url'

export { openKodoHandoffCode, openKodoHandoffFromArgs } from './handoff-url'

/** Returns true when the URL belonged to us and the exchange ran. */
export async function completeOpenKodoProtocol(value: string): Promise<boolean> {
  const code = openKodoHandoffCode(value)
  if (!code) {
    return false
  }
  await completeOpenKodoHandoff(code)
  return true
}
