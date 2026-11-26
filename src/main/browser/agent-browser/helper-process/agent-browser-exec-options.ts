import type { BrowserError } from '../../browser-error'

export type AgentBrowserExecOptions = {
  envOverrides?: NodeJS.ProcessEnv
  timeoutMs?: number
  timeoutError?: BrowserError
  /** The caller owns stdin, so the command goes as argv; only for OpenKodo-authored tokens. */
  stdinText?: string
  /** Send tokens as argv so global options apply; only for OpenKodo-authored or raw CLI tokens. */
  cliArgv?: boolean
}
