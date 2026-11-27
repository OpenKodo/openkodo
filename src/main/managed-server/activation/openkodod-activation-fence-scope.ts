// Resumed stale holders must prove their generation on-host before every step, preventing writes or release under a successor's fence.
import { AsyncLocalStorage } from 'node:async_hooks'
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import { isSshCommandExitError } from '../../ssh/remote-exec/remote-exec-command'

export const OPENKODOD_FENCE_OWNER_FILENAME = '.openkodo-fence-owner'
export const OPENKODOD_FENCE_LOST_MARKER = '__OPENKODOD_FENCE_LOST__'
/** EX_TEMPFAIL: this superseded generation cannot retry its step. */
export const OPENKODOD_FENCE_LOST_EXIT = 75

export type OpenkododFence = { lockDir: string; token: string }

const scope = new AsyncLocalStorage<OpenkododFence>()

export function runWithOpenkododFence<T>(fence: OpenkododFence, run: () => Promise<T>): Promise<T> {
  return scope.run(fence, run)
}

export function currentOpenkododFence(): OpenkododFence | null {
  return scope.getStore() ?? null
}

export class OpenkododFenceLostError extends Error {
  constructor() {
    super(
      "This run's activation fence was taken over by another run, so it stopped before changing the host."
    )
    this.name = 'OpenkododFenceLostError'
  }
}

export function posixOpenkododFenceOwnedTest(fence: OpenkododFence): string {
  const owner = quotePosixShell(
    `${fence.lockDir.replace(/\/+$/u, '')}/${OPENKODOD_FENCE_OWNER_FILENAME}`
  )
  return `[ "$(cat ${owner} 2>/dev/null)" = ${quotePosixShell(fence.token)} ]`
}

export function posixOpenkododFenceGuard(fence: OpenkododFence): string {
  return `${posixOpenkododFenceOwnedTest(fence)} || { echo ${OPENKODOD_FENCE_LOST_MARKER}; exit ${OPENKODOD_FENCE_LOST_EXIT}; };`
}

/** Use exit status and stdout; error messages quote commands containing the marker even when no guard failed. */
export function isOpenkododFenceLost(error: unknown): boolean {
  if (!isSshCommandExitError(error)) {
    return false
  }
  // `powershell -Command` reports any nonzero native exit as 1.
  const exited = error.exitCode === OPENKODOD_FENCE_LOST_EXIT || error.exitCode === 1
  return exited && error.stdout.trim().split(/\r?\n/u).at(-1) === OPENKODOD_FENCE_LOST_MARKER
}
