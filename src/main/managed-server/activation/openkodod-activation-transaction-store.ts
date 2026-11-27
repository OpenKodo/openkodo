import {
  openkododActivationTransactionPath,
  parseOpenkododActivationTransaction,
  serializeOpenkododActivationTransaction,
  type OpenkododActivationTransaction
} from './openkodod-activation-transaction'
import {
  readBoundedOpenkododRemoteRecord,
  writeAtomicOpenkododRemoteRecord
} from '../install/openkodod-remote-record-file'
import type { OpenkododRemoteExecTarget } from '../install/openkodod-remote-runtime-control'
import { currentOpenkododFence } from './openkodod-activation-fence-scope'

const OPENKODOD_ACTIVATION_TRANSACTION_MAX_BYTES = 64 * 1024

type OpenkododActivationTransactionStoreOptions = OpenkododRemoteExecTarget & { remoteHome: string }

/** Only verified absence returns null; unreadable journals retain the fence. */
export async function readOpenkododActivationTransaction(
  options: OpenkododActivationTransactionStoreOptions
): Promise<OpenkododActivationTransaction | null> {
  const read = await readBoundedOpenkododRemoteRecord(
    options,
    openkododActivationTransactionPath(options.host, options.remoteHome),
    OPENKODOD_ACTIVATION_TRANSACTION_MAX_BYTES
  )
  const parsed = parseOpenkododActivationTransaction(read.state === 'present' ? read.raw : null)
  if (parsed.state === 'unreadable') {
    throw new Error(`Cannot read this host's openkodod activation transaction: ${parsed.reason}`)
  }
  return parsed.state === 'ok' ? parsed.transaction : null
}

/** Stamp each write with its fence generation so release cannot delete another holder's journal. */
export function writeOpenkododActivationTransaction(
  options: OpenkododActivationTransactionStoreOptions,
  transaction: OpenkododActivationTransaction
): Promise<void> {
  const fenceToken = currentOpenkododFence()?.token
  return writeAtomicOpenkododRemoteRecord(
    options,
    openkododActivationTransactionPath(options.host, options.remoteHome),
    serializeOpenkododActivationTransaction(
      fenceToken ? { ...transaction, fenceToken } : transaction
    )
  )
}
