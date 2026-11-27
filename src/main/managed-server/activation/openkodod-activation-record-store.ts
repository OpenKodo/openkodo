// Unreadable activation records must fail closed; treating them as absent could overwrite a live install and its rollback target.
import type { OpenkododHostTransport } from '../install/openkodod-host-transport'
import { RELAY_REMOTE_DIR } from '../install/remote-install-root'
import {
  OPENKODOD_ACTIVATION_FILENAME,
  emptyOpenkododActivationRecord,
  parseOpenkododActivationRecord,
  serializeOpenkododActivationRecord,
  type OpenkododActivationReadResult,
  type OpenkododActivationRecord
} from './openkodod-activation-record'
import { joinRemotePath, type RemoteHostPlatform } from '../../ssh/remote-host/ssh-remote-platform'
import {
  readBoundedOpenkododRemoteRecord,
  writeAtomicOpenkododRemoteRecord
} from '../install/openkodod-remote-record-file'

const OPENKODOD_ACTIVATION_RECORD_MAX_BYTES = 64 * 1024

type ActivationRecordTarget = {
  conn: OpenkododHostTransport
  host: RemoteHostPlatform
  remoteHome: string
  signal?: AbortSignal
}

export function openkododActivationPath(host: RemoteHostPlatform, remoteHome: string): string {
  return joinRemotePath(host, remoteHome, RELAY_REMOTE_DIR, OPENKODOD_ACTIVATION_FILENAME)
}

async function readActivationRecordState(
  options: ActivationRecordTarget
): Promise<OpenkododActivationReadResult> {
  const read = await readBoundedOpenkododRemoteRecord(
    options,
    openkododActivationPath(options.host, options.remoteHome),
    OPENKODOD_ACTIVATION_RECORD_MAX_BYTES
  )
  return read.state === 'absent' ? read : parseOpenkododActivationRecord(read.raw)
}

export async function readOpenkododActivationRecord(
  options: ActivationRecordTarget
): Promise<OpenkododActivationRecord> {
  const parsed = await readActivationRecordState(options)
  if (parsed.state === 'ok') {
    return parsed.record
  }
  if (parsed.state === 'unreadable') {
    throw new Error(`Cannot read this host's openkodod activation record: ${parsed.reason}`)
  }
  return emptyOpenkododActivationRecord()
}

/** Refuse replacement of unreadable records, including schemas written by newer clients. */
export async function writeOpenkododActivationRecord(
  options: ActivationRecordTarget,
  record: OpenkododActivationRecord
): Promise<void> {
  const existing = await readActivationRecordState(options)
  if (existing.state === 'unreadable') {
    throw new Error(
      `Refusing to overwrite this host's openkodod activation record: ${existing.reason}`
    )
  }
  await writeAtomicOpenkododRemoteRecord(
    options,
    openkododActivationPath(options.host, options.remoteHome),
    serializeOpenkododActivationRecord(record)
  )
}
