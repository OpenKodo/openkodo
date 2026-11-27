import type { AgentSessionOpenKodoStopCause } from '../../../agent-session/lifecycle/stopping/agent-session-openkodo-stop'
import { joinSentences } from '../../../text/sentence-joining'

/** English pieces; desktop translates each with the same fallback, the phone keeps English. */
export const NATIVE_CHAT_OPENKODO_STOP_COPY = {
  update: 'OpenKodo on {{machine}} restarted for an update while this response was in progress.',
  quit: 'OpenKodo on {{machine}} was closed while this response was in progress.',
  crash: 'OpenKodo on {{machine}} stopped unexpectedly while this response was in progress.',
  // A remote graceful stop is a server stop or a shared desktop's quit; "stopped" is true of both.
  remote: 'OpenKodo on {{machine}} stopped while this response was in progress.',
  canContinue: 'You can continue in this conversation.',
  unnamedServer: 'the remote server'
} as const

export type NativeChatOpenKodoStopCopyId = keyof typeof NATIVE_CHAT_OPENKODO_STOP_COPY
export type NativeChatOpenKodoStopSay = (
  id: NativeChatOpenKodoStopCopyId,
  machine?: string
) => string

export const sayNativeChatOpenKodoStopEnglish: NativeChatOpenKodoStopSay = (id, machine) =>
  machine === undefined
    ? NATIVE_CHAT_OPENKODO_STOP_COPY[id]
    : NATIVE_CHAT_OPENKODO_STOP_COPY[id].replace('{{machine}}', () => machine)

/** Base wording on host continuation support so the sentence stays stable as the button changes. */
export function nativeChatOpenKodoStopRowText(
  cause: AgentSessionOpenKodoStopCause,
  machine: string,
  options: { continueAvailable: boolean; remoteHost: boolean },
  say: NativeChatOpenKodoStopSay = sayNativeChatOpenKodoStopEnglish
): string {
  const stopped = say(cause === 'quit' && options.remoteHost ? 'remote' : cause, machine)
  return options.continueAvailable ? stopped : joinSentences([stopped, say('canContinue')])
}
