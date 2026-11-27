// Exclusive hard links arbitrate stop versus cancel; cancel cannot succeed once dispatch wins.
import { linkSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { writeDurableSecureJsonFile } from '../../../../shared/secure-storage/secure-file'
import {
  OpenkododManagedStopDecisionSchema,
  OpenkododManagedStopRequestSchema,
  type OpenkododManagedStopDecision,
  type OpenkododManagedStopRequest
} from '../../../../shared/remote-runtime/openkodod-lifecycle/openkodod-stop-request'
import {
  openkododStopReceiptPath,
  readOpenkododStopReceipt
} from './openkodod-completed-stop-receipt'
import { hasErrorCode } from '../../../daemon/endpoint/identity/daemon-process-inspection'

type OpenkododManagedStopDecisionValue = OpenkododManagedStopDecision['decision']

export function readOpenkododManagedStopDecision(
  request: OpenkododManagedStopRequest
): OpenkododManagedStopDecisionValue | null {
  return (
    readOpenkododStopReceipt(request, 'decision', OpenkododManagedStopDecisionSchema)?.decision ??
    null
  )
}

export function claimOpenkododManagedStopDecision(
  input: OpenkododManagedStopRequest,
  decision: OpenkododManagedStopDecisionValue
): OpenkododManagedStopDecisionValue {
  const request = OpenkododManagedStopRequestSchema.parse(input)
  const path = openkododStopReceiptPath(request, 'decision')
  const staged = `${path}.${process.pid}.${randomUUID()}.staged`
  const record: OpenkododManagedStopDecision = {
    schemaVersion: 1,
    kind: 'openkodod_managed_stop_decision',
    request,
    decision
  }
  if (!writeDurableSecureJsonFile(staged, record)) {
    rmSync(staged, { force: true })
    throw new Error('openkodod_managed_stop_decision_permissions_unconfirmed')
  }
  try {
    linkSync(staged, path)
    return decision
  } catch (error) {
    if (!hasErrorCode(error, 'EEXIST')) {
      throw error
    }
    const standing = readOpenkododManagedStopDecision(request)
    if (!standing) {
      throw new Error('openkodod_managed_stop_decision_unverifiable')
    }
    return standing
  } finally {
    rmSync(staged, { force: true })
  }
}
