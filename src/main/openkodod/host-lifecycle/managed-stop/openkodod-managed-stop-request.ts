import { createHash } from 'node:crypto'
import { lstatSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { readNodeFileSyncWithinLimit } from '../../../../shared/file-content/node-bounded-file-reader'
import {
  OPENKODOD_MANAGED_STOP_REQUEST_MAX_BYTES,
  OPENKODOD_MANAGED_STOP_REQUEST_PREFIX,
  OpenkododManagedStopRequestSchema,
  type OpenkododManagedStopContext,
  type OpenkododManagedStopInstance,
  type OpenkododManagedStopRequest
} from '../../../../shared/remote-runtime/openkodod-lifecycle/openkodod-stop-request'
import {
  readOpenkododInstanceLockRecord,
  type OpenkododLockRecord
} from '../../instance-lock/openkodod-instance-lock-record'

/** Nonce-scoped paths prevent requests from addressing a previous instance. */
export function openkododManagedStopRequestPath(instance: OpenkododManagedStopInstance): string {
  const digest = createHash('sha256').update(instance.nonce).digest('hex')
  return join(dirname(instance.lockPath), `${OPENKODOD_MANAGED_STOP_REQUEST_PREFIX}.${digest}`)
}

export function readOpenkododManagedStopRequest(path: string): OpenkododManagedStopRequest {
  if (!lstatSync(path).isFile()) {
    throw new Error('openkodod_managed_stop_request_not_regular_file')
  }
  const { buffer } = readNodeFileSyncWithinLimit(path, OPENKODOD_MANAGED_STOP_REQUEST_MAX_BYTES)
  return OpenkododManagedStopRequestSchema.parse(JSON.parse(buffer.toString('utf8')))
}

function sameOpenkododManagedStopInstance(
  left: OpenkododManagedStopInstance,
  right: Pick<OpenkododManagedStopInstance, 'pid' | 'startedAtMs' | 'nonce'>
): boolean {
  return (
    left.pid === right.pid && left.startedAtMs === right.startedAtMs && left.nonce === right.nonce
  )
}

export function openkododInstanceLockNames(instance: OpenkododManagedStopInstance): boolean {
  return readOpenkododInstanceLockNaming(instance) !== null
}

export function readOpenkododInstanceLockNaming(
  instance: OpenkododManagedStopInstance
): OpenkododLockRecord | null {
  if (!lstatSync(instance.lockPath).isFile()) {
    return null
  }
  const record = readOpenkododInstanceLockRecord(instance.lockPath)
  return record !== null && sameOpenkododManagedStopInstance(instance, record) ? record : null
}

export function validateOpenkododManagedStopRequest(
  context: OpenkododManagedStopContext,
  requestPath: string
): OpenkododManagedStopRequest {
  const request = readOpenkododManagedStopRequest(requestPath)
  if (
    request.version !== context.version ||
    request.runtimeId !== context.runtimeId ||
    // Windows clients and servers may use different separators for the same lock.
    resolve(request.instance.lockPath) !== resolve(context.instance.lockPath) ||
    !sameOpenkododManagedStopInstance(request.instance, context.instance)
  ) {
    throw new Error('openkodod_managed_stop_request_identity_mismatch')
  }
  if (!openkododInstanceLockNames(context.instance)) {
    throw new Error('openkodod_managed_stop_instance_lock_changed')
  }
  return request
}
