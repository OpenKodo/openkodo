// Consume clean idle-stop evidence once; discard failed stops so later crashes cannot inherit it.
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { readNodeFileSyncWithinLimit } from '../../../../shared/file-content/node-bounded-file-reader'
import { writeDurableSecureJsonFile } from '../../../../shared/secure-storage/secure-file'
import {
  OPENKODOD_IDLE_STOP_RECORD_FILENAME,
  OpenkododIdleStopRecordSchema,
  type OpenkododIdleStopRecord
} from '../../../../shared/remote-runtime/openkodod-lifecycle/openkodod-idle-exit'
import type { OpenkododIdleExitEvidence } from './openkodod-idle-exit-monitor'
import { hasErrorCode } from '../../../daemon/endpoint/identity/daemon-process-inspection'

const RECORD_MAX_BYTES = 16 * 1024

export function openkododIdleStopRecordPath(userDataPath: string): string {
  return join(userDataPath, OPENKODOD_IDLE_STOP_RECORD_FILENAME)
}

export function writeOpenkododIdleStopRecord(
  userDataPath: string,
  evidence: OpenkododIdleExitEvidence,
  version: string
): void {
  const record: OpenkododIdleStopRecord = {
    schemaVersion: 1,
    kind: 'openkodod_idle_stop',
    pid: process.pid,
    version,
    quietSince: new Date(evidence.quietSince).toISOString(),
    stoppedAt: new Date(evidence.stoppedAt).toISOString(),
    idleTimeoutMs: evidence.timeoutMs
  }
  if (!writeDurableSecureJsonFile(openkododIdleStopRecordPath(userDataPath), record)) {
    throw new Error('openkodod_idle_stop_record_permissions_unconfirmed')
  }
}

export function consumeOpenkododIdleStopRecord(
  userDataPath: string
): OpenkododIdleStopRecord | null {
  const path = openkododIdleStopRecordPath(userDataPath)
  let record: OpenkododIdleStopRecord | null = null
  try {
    const raw = readNodeFileSyncWithinLimit(path, RECORD_MAX_BYTES).buffer.toString('utf8')
    record = OpenkododIdleStopRecordSchema.parse(JSON.parse(raw))
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) {
      return null
    }
    console.error('[openkodod] ignoring an unreadable idle-stop record:', error)
  }
  rmSync(path, { force: true })
  return record
}

export function discardOpenkododIdleStopRecord(userDataPath: string): void {
  rmSync(openkododIdleStopRecordPath(userDataPath), { force: true })
}
