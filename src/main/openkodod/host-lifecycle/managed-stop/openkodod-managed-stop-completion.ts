// Request shutdown without signaling; only kernel identity, owner change or PID absence proves exit.
import { setTimeout as delay } from 'node:timers/promises'
import { writeDurableSecureJsonFile } from '../../../../shared/secure-storage/secure-file'
import {
  OpenkododManagedStopRequestSchema,
  openkododManagedStopRequestKey,
  type OpenkododManagedStopInstance,
  type OpenkododManagedStopRequest,
  type OpenkododManagedStopVerdict
} from '../../../../shared/remote-runtime/openkodod-lifecycle/openkodod-stop-request'
import {
  compareOpenkododProcessIdentity,
  recordedOpenkododProcessIncarnation,
  type OpenkododProcessIdentityReaders,
  type OpenkododRecordedIdentity
} from '../../instance-lock/openkodod-process-start-time'
import {
  hasErrorCode,
  inspectProcessSignal
} from '../../../daemon/endpoint/identity/daemon-process-inspection'
import { persistOpenkododCompletedStopReceipt } from './openkodod-completed-stop-receipt'
import { readOpenkododManagedStopDecision } from './openkodod-managed-stop-decision'
import { withdrawOpenkododManagedStopRequest } from './openkodod-managed-stop-cancellation'
import {
  openkododInstanceLockNames,
  openkododManagedStopRequestPath,
  readOpenkododInstanceLockNaming,
  readOpenkododManagedStopRequest
} from './openkodod-managed-stop-request'
import {
  OPENKODOD_STOP_COMPLETION_POLL_ATTEMPTS,
  OPENKODOD_STOP_COMPLETION_POLL_MS
} from './openkodod-stop-deadlines'

type OpenkododProcessProbe = (pid: number) => 'alive' | 'missing' | 'unverifiable'

export type OpenkododManagedStopCompletionOptions = OpenkododProcessIdentityReaders & {
  probeProcess?: OpenkododProcessProbe
  sleep?: () => Promise<void>
  attempts?: number
  now?: () => Date
}

function defaultProbe(pid: number): ReturnType<OpenkododProcessProbe> {
  const signal = inspectProcessSignal(pid)
  // EPERM proves some process holds the PID; it cannot prove ours exited.
  return signal === 'occupied' ? 'alive' : signal === 'missing' ? 'missing' : 'unverifiable'
}

function observeInstance(
  instance: OpenkododManagedStopInstance,
  recorded: OpenkododRecordedIdentity,
  options: OpenkododManagedStopCompletionOptions
): OpenkododManagedStopVerdict {
  const probe = (options.probeProcess ?? defaultProbe)(instance.pid)
  if (probe !== 'alive') {
    return probe === 'missing' ? 'exited' : 'unverifiable'
  }
  // Wall-clock drift alone cannot prove PID reuse.
  const identity = compareOpenkododProcessIdentity(instance.pid, recorded, options)
  return identity === 'differs' ? 'exited' : identity === 'unproven' ? 'unverifiable' : 'live'
}

/** Recover incarnation data from the lock for older clients that omit it. */
function recordedIdentity(instance: OpenkododManagedStopInstance): OpenkododRecordedIdentity {
  if (recordedOpenkododProcessIncarnation(instance)) {
    return instance
  }
  let record: OpenkododRecordedIdentity | null = null
  try {
    record = readOpenkododInstanceLockNaming(instance)
  } catch {
    return instance
  }
  if (!record) {
    return instance
  }
  return { ...instance, ...recordedOpenkododProcessIncarnation(record), identity: record.identity }
}

export async function completeOpenkododManagedStop(
  input: OpenkododManagedStopRequest,
  options: OpenkododManagedStopCompletionOptions = {}
): Promise<OpenkododManagedStopVerdict> {
  const request = OpenkododManagedStopRequestSchema.parse(input)
  const attempts = options.attempts ?? OPENKODOD_STOP_COMPLETION_POLL_ATTEMPTS
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 240) {
    throw new Error('openkodod_managed_stop_invalid_attempts')
  }
  const completed = (): 'exited' => {
    persistOpenkododCompletedStopReceipt(request, (options.now ?? (() => new Date()))())
    return 'exited'
  }
  const recorded = recordedIdentity(request.instance)
  let verdict = observeInstance(request.instance, recorded, options)
  if (verdict !== 'live') {
    return verdict === 'exited' ? completed() : verdict
  }
  if (!lockStillNamesInstance(request.instance)) {
    // A live process that relinquished its lock is no longer ours to address.
    return 'unverifiable'
  }
  if (readOpenkododManagedStopDecision(request) === 'canceled') {
    return 'live'
  }
  const requestPath = openkododManagedStopRequestPath(request.instance)
  if (!existingRequestMatches(requestPath, request)) {
    return 'unverifiable'
  }
  if (!writeDurableSecureJsonFile(requestPath, request)) {
    throw new Error('openkodod_managed_stop_request_permissions_unconfirmed')
  }
  // A cancel between the first check and write had no request file to remove.
  if (readOpenkododManagedStopDecision(request) === 'canceled') {
    withdrawOpenkododManagedStopRequest(request)
    return 'live'
  }
  for (let attempt = 0; attempt < attempts; attempt++) {
    await (options.sleep ?? (() => delay(OPENKODOD_STOP_COMPLETION_POLL_MS)))()
    verdict = observeInstance(request.instance, recorded, options)
    if (verdict !== 'live') {
      return verdict === 'exited' ? completed() : verdict
    }
  }
  return 'live'
}

function lockStillNamesInstance(instance: OpenkododManagedStopInstance): boolean {
  try {
    return openkododInstanceLockNames(instance)
  } catch {
    return false
  }
}

function existingRequestMatches(path: string, request: OpenkododManagedStopRequest): boolean {
  try {
    return (
      openkododManagedStopRequestKey(readOpenkododManagedStopRequest(path)) ===
      openkododManagedStopRequestKey(request)
    )
  } catch (error) {
    return hasErrorCode(error, 'ENOENT')
  }
}
