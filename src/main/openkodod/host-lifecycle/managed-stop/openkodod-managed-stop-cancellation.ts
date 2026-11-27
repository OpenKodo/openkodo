import { rmSync } from 'node:fs'
import type {
  OpenkododManagedStopCancellation,
  OpenkododManagedStopRequest
} from '../../../../shared/remote-runtime/openkodod-lifecycle/openkodod-stop-request'
import { claimOpenkododManagedStopDecision } from './openkodod-managed-stop-decision'
import {
  openkododManagedStopRequestPath,
  readOpenkododManagedStopRequest
} from './openkodod-managed-stop-request'

/** Dispatched stops cannot be canceled; their completion verdict remains authoritative. */
export function cancelOpenkododManagedStop(
  request: OpenkododManagedStopRequest
): OpenkododManagedStopCancellation['outcome'] {
  const outcome = claimOpenkododManagedStopDecision(request, 'canceled')
  if (outcome === 'canceled') {
    withdrawOpenkododManagedStopRequest(request)
  }
  return outcome
}

export function withdrawOpenkododManagedStopRequest(request: OpenkododManagedStopRequest): void {
  const path = openkododManagedStopRequestPath(request.instance)
  try {
    if (readOpenkododManagedStopRequest(path).transactionId === request.transactionId) {
      rmSync(path, { force: true })
    }
  } catch {
    // The persisted decision fences this transaction even if its request is gone.
  }
}
