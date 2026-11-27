import { lstatSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { z } from 'zod'
import { readNodeFileSyncWithinLimit } from '../../../../shared/file-content/node-bounded-file-reader'
import { writeDurableSecureJsonFile } from '../../../../shared/secure-storage/secure-file'
import { hasErrorCode } from '../../../daemon/endpoint/identity/daemon-process-inspection'
import {
  OPENKODOD_STOP_RECEIPTS_DIRNAME,
  OpenkododCompletedStopReceiptSchema,
  OpenkododManagedStopRequestSchema,
  OpenkododDaemonRetirementRecordSchema,
  openkododManagedStopRequestKey,
  type OpenkododCompletedStopReceipt,
  type OpenkododDaemonRetirementRecord,
  type OpenkododManagedStopRequest
} from '../../../../shared/remote-runtime/openkodod-lifecycle/openkodod-stop-request'

const RECEIPT_MAX_BYTES = 64 * 1024

type ReceiptKind = 'completed' | 'retirement' | 'decision'

export function openkododStopReceiptPath(
  request: OpenkododManagedStopRequest,
  kind: ReceiptKind
): string {
  const { transactionId, instance } = OpenkododManagedStopRequestSchema.parse(request)
  const suffix = kind === 'completed' ? '' : `.${kind}`
  return join(
    dirname(instance.lockPath),
    OPENKODOD_STOP_RECEIPTS_DIRNAME,
    `${transactionId}${suffix}.json`
  )
}

/** Absent returns null; mismatched request receipts throw. */
export function readOpenkododStopReceipt<T extends { request: OpenkododManagedStopRequest }>(
  request: OpenkododManagedStopRequest,
  kind: ReceiptKind,
  schema: z.ZodType<T>
): T | null {
  const path = openkododStopReceiptPath(request, kind)
  try {
    if (!lstatSync(path).isFile()) {
      throw new Error('openkodod_stop_receipt_unverifiable')
    }
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) {
      return null
    }
    throw error
  }
  const receipt = schema.parse(
    JSON.parse(readNodeFileSyncWithinLimit(path, RECEIPT_MAX_BYTES).buffer.toString('utf8'))
  )
  if (openkododManagedStopRequestKey(receipt.request) !== openkododManagedStopRequestKey(request)) {
    throw new Error('openkodod_stop_receipt_mismatch')
  }
  return receipt
}

function writeReceipt(
  request: OpenkododManagedStopRequest,
  kind: ReceiptKind,
  receipt: unknown
): void {
  if (!writeDurableSecureJsonFile(openkododStopReceiptPath(request, kind), receipt)) {
    throw new Error('openkodod_stop_receipt_permissions_unconfirmed')
  }
}

export function readOpenkododCompletedStopReceipt(
  request: OpenkododManagedStopRequest
): OpenkododCompletedStopReceipt | null {
  return readOpenkododStopReceipt(request, 'completed', OpenkododCompletedStopReceiptSchema)
}

/** Persist only after proven exit and fsync even existing receipts.
 * Missing retirement records remain unverifiable. */
export function persistOpenkododCompletedStopReceipt(
  request: OpenkododManagedStopRequest,
  exitedAt: Date
): OpenkododCompletedStopReceipt {
  const parsed = OpenkododManagedStopRequestSchema.parse(request)
  const retirement = parsed.retireIdleDaemon
    ? (readOpenkododDaemonRetirementRecord(parsed)?.retirement ?? 'unverifiable')
    : undefined
  const receipt = readOpenkododCompletedStopReceipt(parsed) ?? {
    schemaVersion: 1 as const,
    kind: 'openkodod_managed_stop_completed' as const,
    request: parsed,
    exitedAt: exitedAt.toISOString(),
    ...(retirement ? { retirement } : {})
  }
  writeReceipt(parsed, 'completed', receipt)
  return receipt
}

export function readOpenkododDaemonRetirementRecord(
  request: OpenkododManagedStopRequest
): OpenkododDaemonRetirementRecord | null {
  return readOpenkododStopReceipt(request, 'retirement', OpenkododDaemonRetirementRecordSchema)
}

export function persistOpenkododDaemonRetirementRecord(
  request: OpenkododManagedStopRequest,
  outcome: Pick<OpenkododDaemonRetirementRecord, 'retirement' | 'liveSessions' | 'reason'>
): void {
  writeReceipt(request, 'retirement', {
    schemaVersion: 1,
    kind: 'openkodod_managed_stop_retirement',
    request: OpenkododManagedStopRequestSchema.parse(request),
    // Name fields explicitly; extra in-process fields would fail the strict schema.
    retirement: outcome.retirement,
    liveSessions: outcome.liveSessions,
    reason: outcome.reason
  })
}
