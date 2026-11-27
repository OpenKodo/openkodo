/** Stop files reach only the watching openkodod; signals from stale PID records could stop an unrelated reused process. */
import { z } from 'zod'
import { openEnum } from '../../validation/zod-salvage'

/** Plain request in the slot directory: the same graceful stop as SIGTERM. */
export const OPENKODOD_STOP_REQUEST_FILENAME = '.openkodod-stop-request'
/** Prefix of an instance-bound request in the data root; older listeners never match it. */
export const OPENKODOD_MANAGED_STOP_REQUEST_PREFIX = '.openkodod-managed-stop-request'
export const OPENKODOD_MANAGED_STOP_REQUEST_MAX_BYTES = 32 * 1024
export const OPENKODOD_STOP_RECEIPTS_DIRNAME = 'openkodod-stop-receipts'
export const OPENKODOD_COMPLETE_MANAGED_STOP_FLAG = '--complete-managed-stop'
/** Names a staged request file instead of inline JSON; Windows hosts never put the JSON on argv. */
export const OPENKODOD_MANAGED_STOP_REQUEST_FILE_FLAG = '--request-file'

/** One openkodod process: its PID, start time, and the instance lock record it published. */
export const OpenkododManagedStopInstanceSchema = z.object({
  pid: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  startedAtMs: z.number().finite().nonnegative().nullable(),
  /** Linux only, copied from the lock; older clients omit it and older slots drop it. */
  linuxStartTicks: z.string().regex(/^\d+$/).max(32).optional().catch(undefined),
  bootId: z.string().min(1).max(255).optional().catch(undefined),
  nonce: z.string().min(1).max(255),
  lockPath: z.string().min(1).max(4096)
})

// Older slots drop newer optional request fields rather than refuse the stop.
export const OpenkododManagedStopRequestSchema = z.object({
  schemaVersion: z.literal(1),
  transactionId: z.uuid(),
  version: z.string().min(1).max(255),
  runtimeId: z.string().min(1).max(255),
  instance: OpenkododManagedStopInstanceSchema,
  /** Best effort: also retire the terminal daemon if it is provably idle. Never blocks the stop. */
  retireIdleDaemon: z.literal(true).optional()
})

export type OpenkododManagedStopInstance = z.infer<typeof OpenkododManagedStopInstanceSchema>
export type OpenkododManagedStopRequest = z.infer<typeof OpenkododManagedStopRequestSchema>

/** Equality key for a request; omits the incarnation, which an older client recovering it drops. */
export function openkododManagedStopRequestKey(request: OpenkododManagedStopRequest): string {
  const { instance, ...rest } = OpenkododManagedStopRequestSchema.parse(request)
  const { linuxStartTicks: _ticks, bootId: _bootId, ...bound } = instance
  return JSON.stringify({ ...rest, instance: bound })
}
/** What a stopping openkodod must match before a managed request may stop it. */
export type OpenkododManagedStopContext = Omit<
  OpenkododManagedStopRequest,
  'schemaVersion' | 'transactionId'
>

const STOP_VERDICTS = ['live', 'unverifiable', 'exited'] as const
const RETIREMENT_VERDICTS = ['retired', 'live', 'unverifiable'] as const

/** The execution host's verdict; `exited` only on proof, never on silence. */
export const OpenkododManagedStopVerdictSchema = z.enum(STOP_VERDICTS)

/** `retired` only when the daemon accepted; a busy daemon stays up and keeps its terminals. */
export const OpenkododDaemonRetirementVerdictSchema = z.enum(RETIREMENT_VERDICTS)

// Read by clients older than the slot that printed them: unknown fields and arms degrade.
const stopReplyRequestFields = OpenkododManagedStopRequestSchema.shape

export const OpenkododManagedStopCompletionSchema = z.object({
  ...stopReplyRequestFields,
  kind: z.literal('openkodod_managed_stop_completion'),
  verdict: openEnum(STOP_VERDICTS, 'unverifiable'),
  receiptPersisted: z.boolean(),
  /** For a request that asked to retire the daemon, the outcome its receipt recorded. */
  retirement: openEnum(RETIREMENT_VERDICTS, 'unverifiable').optional()
})

/** What the stopping openkodod observed about its daemon, written before it exits. */
export const OpenkododDaemonRetirementRecordSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal('openkodod_managed_stop_retirement'),
  request: OpenkododManagedStopRequestSchema,
  retirement: OpenkododDaemonRetirementVerdictSchema,
  liveSessions: z.number().int().nonnegative().nullable(),
  reason: z.string().max(4096).nullable()
})

export const OpenkododCompletedStopReceiptSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal('openkodod_managed_stop_completed'),
  request: OpenkododManagedStopRequestSchema,
  exitedAt: z.iso.datetime({ offset: true }),
  /** Present only when the request asked to retire the daemon. */
  retirement: OpenkododDaemonRetirementVerdictSchema.optional()
})

export type OpenkododManagedStopVerdict = z.infer<typeof OpenkododManagedStopVerdictSchema>
export type OpenkododManagedStopCompletion = z.infer<typeof OpenkododManagedStopCompletionSchema>
export type OpenkododCompletedStopReceipt = z.infer<typeof OpenkododCompletedStopReceiptSchema>
export type OpenkododDaemonRetirementVerdict = z.infer<
  typeof OpenkododDaemonRetirementVerdictSchema
>
export type OpenkododDaemonRetirementRecord = z.infer<typeof OpenkododDaemonRetirementRecordSchema>

export const OPENKODOD_CANCEL_MANAGED_STOP_FLAG = '--cancel-managed-stop'
/** Readiness `health.stopRequests`: this build consumes stop files and both commands above. */
export const OPENKODOD_STOP_REQUESTS_CAPABILITY = 1

/** Exclusive per-transaction creation ensures only openkodod dispatch or client cancellation can win. */
export const OpenkododManagedStopDecisionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal('openkodod_managed_stop_decision'),
  request: OpenkododManagedStopRequestSchema,
  decision: z.enum(['dispatched', 'canceled'])
})

/** `dispatched` means openkodod already acted on the request; the caller must await its exit. */
export const OpenkododManagedStopCancellationSchema = z.object({
  ...stopReplyRequestFields,
  kind: z.literal('openkodod_managed_stop_cancellation'),
  // Unknown degrades to `dispatched`: the caller then awaits exit rather than assume a cancel.
  outcome: openEnum(['canceled', 'dispatched'], 'dispatched')
})

export type OpenkododManagedStopDecision = z.infer<typeof OpenkododManagedStopDecisionSchema>
export type OpenkododManagedStopCancellation = z.infer<
  typeof OpenkododManagedStopCancellationSchema
>
