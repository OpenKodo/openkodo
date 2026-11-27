export const OPENKODO_RENDERER_UNLOAD_PREVENTED_EVENT = 'openkodo:renderer-unload-prevented'
export const OPENKODO_RENDERER_SHUTDOWN_CHECKPOINT_FAILED_EVENT =
  'openkodo:renderer-shutdown-checkpoint-failed'
export const OPENKODO_RENDERER_SHUTDOWN_CHECKPOINT_ABORTED_EVENT =
  'openkodo:renderer-shutdown-checkpoint-aborted'
/** Main-initiated reloads have no renderer caller to report a failed checkpoint. */
export const OPENKODO_NATIVE_UNLOAD_FAILED_EVENT = 'openkodo:native-unload-failed'

// DOM attributes carry failure details across renderer/preload worlds; event JS payloads cannot cross.
export const OPENKODO_SHUTDOWN_CHECKPOINT_FAILURE_REASON_ATTRIBUTE =
  'data-openkodo-shutdown-checkpoint-failure'

export function formatShutdownCheckpointFailureReason(error: unknown): string {
  try {
    const reason = String(error instanceof Error ? error.message : error)
    return reason || 'Unknown shutdown checkpoint failure'
  } catch {
    return 'Unknown shutdown checkpoint failure'
  }
}

export function publishShutdownCheckpointFailureReason(reason: string): void {
  try {
    globalThis.document?.documentElement?.setAttribute(
      OPENKODO_SHUTDOWN_CHECKPOINT_FAILURE_REASON_ATTRIBUTE,
      reason
    )
  } catch {
    // Best-effort diagnostics; the checkpoint verdict itself is carried by the event.
  }
}

export function clearShutdownCheckpointFailureReason(): void {
  try {
    globalThis.document?.documentElement?.removeAttribute(
      OPENKODO_SHUTDOWN_CHECKPOINT_FAILURE_REASON_ATTRIBUTE
    )
  } catch {
    // Best-effort diagnostics only.
  }
}

/** Read and clear the published reason so a stale one can't label a later failure. */
export function consumeShutdownCheckpointFailureReason(): string | null {
  try {
    const root = globalThis.document?.documentElement
    const reason = root?.getAttribute(OPENKODO_SHUTDOWN_CHECKPOINT_FAILURE_REASON_ATTRIBUTE)
    if (reason) {
      root?.removeAttribute(OPENKODO_SHUTDOWN_CHECKPOINT_FAILURE_REASON_ATTRIBUTE)
    }
    return reason || null
  } catch {
    return null
  }
}
