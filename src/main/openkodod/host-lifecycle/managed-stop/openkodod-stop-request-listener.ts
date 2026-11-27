// Consume slot stop files; retain validated instance-bound requests as evidence until exit is proven.
import { unlinkSync, watch, type FSWatcher } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import {
  OPENKODOD_STOP_REQUEST_FILENAME,
  type OpenkododManagedStopContext,
  type OpenkododManagedStopRequest
} from '../../../../shared/remote-runtime/openkodod-lifecycle/openkodod-stop-request'
import {
  openkododManagedStopRequestPath,
  validateOpenkododManagedStopRequest
} from './openkodod-managed-stop-request'
import { claimOpenkododManagedStopDecision } from './openkodod-managed-stop-decision'
import { withdrawOpenkododManagedStopRequest } from './openkodod-managed-stop-cancellation'
import { hasErrorCode } from '../../../daemon/endpoint/identity/daemon-process-inspection'
import { watchedDirectoryDeletionCheck } from '../../../../shared/file-watch/windows-deleted-directory-watch'

export type OpenkododStopRequestListener = { close(): void }

const DEFAULT_POLL_INTERVAL_MS = 1_000

function listenForRequest<T>(
  requestPath: string,
  consume: (path: string) => T | null,
  onRequest: (request: T) => void,
  pollIntervalMs: number
): OpenkododStopRequestListener {
  let closed = false
  let lastFailure: string | null = null
  const check = (): void => {
    if (closed) {
      return
    }
    let request: T | null
    try {
      request = consume(requestPath)
    } catch (error) {
      if (!hasErrorCode(error, 'ENOENT')) {
        const failure = error instanceof Error ? error.message : String(error)
        if (failure !== lastFailure) {
          lastFailure = failure
          console.error(`[openkodod] refused stop request at ${requestPath}:`, error)
        }
      }
      return
    }
    if (request === null) {
      return
    }
    closed = true
    stop()
    onRequest(request)
  }
  const isDirectoryDeleted = watchedDirectoryDeletionCheck(dirname(requestPath))
  let watcher: FSWatcher | null = null
  try {
    watcher = watch(dirname(requestPath), (event, changed) => {
      if (isDirectoryDeleted(event, changed)) {
        // Closing ends libuv's re-arm loop; polling still delivers requests.
        watcher?.close()
        return
      }
      if (!changed || basename(String(changed)) === basename(requestPath)) {
        check()
      }
    })
    watcher.on('error', (error) => console.error('[openkodod] stop-request watcher failed:', error))
    watcher.unref()
  } catch (error) {
    // Polling still delivers requests when filesystem watching fails.
    console.error('[openkodod] stop-request watcher could not start:', error)
  }
  const poll = setInterval(check, pollIntervalMs)
  poll.unref()
  const stop = (): void => {
    watcher?.close()
    clearInterval(poll)
  }
  check()
  return {
    close: () => {
      closed = true
      stop()
    }
  }
}

export function installOpenkododStopRequestListeners(
  onRequest: () => void,
  options: {
    installRoot: string
    managedStop?: OpenkododManagedStopContext
    /** Best-effort preparation runs before shutdown and cannot prevent it. */
    beforeManagedStop?: (request: OpenkododManagedStopRequest) => Promise<void>
    pollIntervalMs?: number
  }
): OpenkododStopRequestListener {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
  // Initial checks can close listeners synchronously before setup returns.
  const listeners: OpenkododStopRequestListener[] = []
  const close = (): void => {
    for (const listener of listeners) {
      listener.close()
    }
  }
  listeners.push(
    listenForRequest(
      join(options.installRoot, OPENKODOD_STOP_REQUEST_FILENAME),
      (path) => {
        unlinkSync(path)
        return true
      },
      () => onRequest(),
      pollIntervalMs
    )
  )
  const managedStop = options.managedStop
  if (managedStop) {
    const prepare = options.beforeManagedStop ?? (async () => {})
    listeners.push(
      listenForRequest(
        openkododManagedStopRequestPath(managedStop.instance),
        (path) => {
          const request = validateOpenkododManagedStopRequest(managedStop, path)
          if (claimOpenkododManagedStopDecision(request, 'dispatched') === 'canceled') {
            // Withdraw canceled requests so later transactions can publish their own.
            withdrawOpenkododManagedStopRequest(request)
            throw new Error('openkodod_managed_stop_canceled')
          }
          return request
        },
        (request) => {
          close()
          void prepare(request)
            .catch((error: unknown) =>
              console.error('[openkodod] managed stop preparation failed:', error)
            )
            .finally(onRequest)
        },
        pollIntervalMs
      )
    )
  }
  return { close }
}
