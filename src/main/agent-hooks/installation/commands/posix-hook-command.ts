import { quotePosixShell } from '../../../../shared/shell/launch/shell-argument-quoting'
import { OPENKODO_SCRUB_SAFE_PANE_ENV } from '../../../../shared/agent-hook-listener/transport/agent-hook-scrub-safe-env'
import {
  POSIX_HOOK_STDIN_BACKGROUND_DRAIN_COMMAND,
  POSIX_HOOK_STDIN_DRAIN_COMMAND
} from '../scripts/hook-stdin-contract'

// Global hooks also fire outside OpenKodo, where only the drain runs; the alias covers agents that scrub the key.
// Default-form variables survive Grok prechecks.
export const POSIX_OPENKODO_PANE_GUARD = `[ -n "\${OPENKODO_PANE_KEY-}\${${OPENKODO_SCRUB_SAFE_PANE_ENV}-}" ]`

// Missing scripts must become silent no-ops rather than fail every tool call.
export function wrapPosixHookCommand(
  scriptPath: string,
  env: Record<string, string> = {},
  // Gate events treat silence as denial, so missing scripts may need fallback stdout.
  // Hosts that ignore unread stdin may exit outside OpenKodo before the drain spawns `cat`.
  options: { fallbackStdout?: string; stdinMayStayOpen?: boolean; exitOutsideOrca?: boolean } = {}
): string {
  // Keep arbitrary paths literal across shell metacharacters.
  const quoted = quotePosixShell(scriptPath)
  const envPrefix = Object.entries(env)
    .map(([key, value]) => `${key}=${quotePosixShell(value)}`)
    .join(' ')
  const invocation = envPrefix ? `${envPrefix} /bin/sh ${quoted}` : `/bin/sh ${quoted}`
  const drain = options.stdinMayStayOpen
    ? POSIX_HOOK_STDIN_BACKGROUND_DRAIN_COMMAND
    : POSIX_HOOK_STDIN_DRAIN_COMMAND
  const fallback =
    options.fallbackStdout === undefined
      ? drain
      : `printf '%s\\n' ${quotePosixShell(options.fallbackStdout)}; ${drain}`
  const fileGuards = [`[ -f ${quoted} ]`, `[ -r ${quoted} ]`, `[ -x ${quoted} ]`]
  if (options.exitOutsideOrca) {
    return `${POSIX_OPENKODO_PANE_GUARD} || exit 0; if ${fileGuards.join(' && ')}; then ${invocation}; else ${fallback}; fi`
  }
  const guards = [POSIX_OPENKODO_PANE_GUARD, ...fileGuards].join(' && ')
  return `if ${guards}; then ${invocation}; else ${fallback}; fi`
}
