// Readiness and instance-lock records must agree before the slot's own build requests a stop.
import { randomUUID } from 'node:crypto'
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import { selectOpenkododSlotRuntimeCommand } from '../install/openkodod-remote-runtime'
import {
  parseOpenkododReadinessWaitOutput,
  readOpenkododReadinessNowCommand
} from '../install/openkodod-remote-readiness-wait'
import { execOpenkododRemote } from '../install/openkodod-remote-runtime-control'
import { readBoundedOpenkododRemoteRecord } from '../install/openkodod-remote-record-file'
import { openkododSlotDir, type OpenkododSlotOptions } from '../activation/openkodod-recovery-slot'
import { isWindowsRemoteHost, joinRemotePath } from '../../ssh/remote-host/ssh-remote-platform'
import { isUnconfirmedSshCommandTermination } from '../../ssh/remote-exec/remote-exec-command'
import {
  openkododWindowsNodeCommandLine,
  openkododWindowsSlotOpCommand,
  readOpenkododWindowsEncodedAnswer
} from '../install/openkodod-remote-windows-node'
import { OPENKODOD_WINDOWS_RUNTIME_MARKER } from '../host-state/openkodod-windows-host-script'
import { OPENKODOD_LOCK_FILE_NAME } from '../../openkodod/instance-lock/openkodod-instance-lock'
import { parseOpenkododInstanceLockRecord } from '../../openkodod/instance-lock/openkodod-instance-lock-record'
import {
  OPENKODOD_CANCEL_MANAGED_STOP_FLAG,
  OPENKODOD_COMPLETE_MANAGED_STOP_FLAG,
  OPENKODOD_MANAGED_STOP_REQUEST_FILE_FLAG,
  OPENKODOD_STOP_REQUESTS_CAPABILITY,
  OpenkododManagedStopCancellationSchema,
  OpenkododManagedStopCompletionSchema,
  type OpenkododManagedStopCancellation,
  type OpenkododManagedStopCompletion,
  type OpenkododManagedStopContext,
  type OpenkododManagedStopRequest
} from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-stop-request'

const LOCK_RECORD_MAX_BYTES = 64 * 1024

export type OpenkododManagedStopTarget =
  | { state: 'ready'; context: OpenkododManagedStopContext }
  | { state: 'refused'; verdict: 'unverifiable'; code: string; reason: string }

function refused(code: string, reason: string): OpenkododManagedStopTarget {
  return { state: 'refused', verdict: 'unverifiable', code, reason }
}

export async function readRemoteOpenkododManagedStopTarget(
  options: OpenkododSlotOptions,
  version: string
): Promise<OpenkododManagedStopTarget> {
  const slotDir = openkododSlotDir(options, version)
  const readiness = parseOpenkododReadinessWaitOutput(
    options.host,
    await execOpenkododRemote(options, readOpenkododReadinessNowCommand(options.host, slotDir))
  )
  if (readiness.state !== 'ready' || !readiness.readiness.health) {
    return refused(
      'openkodod_managed_stop_readiness_unverifiable',
      `openkodod ${version} has no readable readiness record, so the running instance is unknown.`
    )
  }
  const { health, runtimeId } = readiness.readiness
  if (health.stopRequests !== OPENKODOD_STOP_REQUESTS_CAPABILITY) {
    return refused(
      'openkodod_managed_stop_unsupported',
      `openkodod ${version} predates managed stop requests; it can only be stopped by signal.`
    )
  }
  const lockPath = joinRemotePath(options.host, options.userDataDir, OPENKODOD_LOCK_FILE_NAME)
  const lockRead = await readBoundedOpenkododRemoteRecord(options, lockPath, LOCK_RECORD_MAX_BYTES)
  const lock = lockRead.state === 'present' ? parseOpenkododInstanceLockRecord(lockRead.raw) : null
  if (!lock || lock.pid !== health.pid || !runtimeId) {
    return refused(
      'openkodod_managed_stop_instance_unverifiable',
      `The instance lock does not name the openkodod ${version} that published readiness.`
    )
  }
  return {
    state: 'ready',
    context: {
      version,
      runtimeId,
      instance: {
        pid: lock.pid,
        startedAtMs: lock.startedAtMs,
        // Newer slots use boot/start ticks to avoid wall-clock drift; older readers drop them.
        ...(lock.linuxStartTicks && lock.bootId
          ? { linuxStartTicks: lock.linuxStartTicks, bootId: lock.bootId }
          : {}),
        nonce: lock.nonce,
        lockPath
      }
    }
  }
}

export async function completeRemoteOpenkododManagedStop(
  options: OpenkododSlotOptions,
  request: OpenkododManagedStopRequest
): Promise<OpenkododManagedStopCompletion> {
  return OpenkododManagedStopCompletionSchema.parse(
    await runSlotCommand(options, request, OPENKODOD_COMPLETE_MANAGED_STOP_FLAG)
  )
}

export async function cancelRemoteOpenkododManagedStop(
  options: OpenkododSlotOptions,
  request: OpenkododManagedStopRequest
): Promise<OpenkododManagedStopCancellation> {
  return OpenkododManagedStopCancellationSchema.parse(
    await runSlotCommand(options, request, OPENKODOD_CANCEL_MANAGED_STOP_FLAG)
  )
}

// The slot's own build owns its stop-request format.
async function runSlotCommand(
  options: OpenkododSlotOptions,
  request: OpenkododManagedStopRequest,
  flag: string
): Promise<unknown> {
  const slotDir = openkododSlotDir(options, request.version)
  const entry = joinRemotePath(options.host, slotDir, 'openkodod.js')
  const output = isWindowsRemoteHost(options.host)
    ? await runWindowsSlotCommand(options, slotDir, entry, request, flag)
    : await execOpenkododRemote(
        options,
        `${selectOpenkododSlotRuntimeCommand(options.host, slotDir, options.nodePath)} && ` +
          `"$openkodod_runtime" ${quotePosixShell(entry)} ${flag} ${quotePosixShell(JSON.stringify(request))}`
      )
  const line = output
    .trim()
    .split('\n')
    .findLast((candidate) => candidate.trim().startsWith('{'))
  if (!line) {
    throw new Error('openkodod managed stop command returned no verifiable answer')
  }
  const parsed: unknown = JSON.parse(line)
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('openkodod managed stop command returned no verifiable answer')
  }
  if (!('transactionId' in parsed) || parsed.transactionId !== request.transactionId) {
    throw new Error('openkodod managed stop command answered another transaction')
  }
  return parsed
}

// Stage JSON on Windows to avoid two command-line quoting layers.
async function runWindowsSlotCommand(
  options: OpenkododSlotOptions,
  slotDir: string,
  entry: string,
  request: OpenkododManagedStopRequest,
  flag: string
): Promise<string> {
  const runtime = readOpenkododWindowsEncodedAnswer(
    await execOpenkododRemote(
      options,
      openkododWindowsSlotOpCommand(options.host, slotDir, 'slot-runtime', [slotDir])
    ),
    OPENKODOD_WINDOWS_RUNTIME_MARKER
  )
  if (!runtime) {
    throw new Error('The Windows host did not name the runtime this openkodod slot needs.')
  }
  const staged = joinRemotePath(
    options.host,
    slotDir,
    `.openkodod-stop-command-${randomUUID()}.json`
  )
  let removeStaged = true
  try {
    await options.conn.writeFile(staged, JSON.stringify(request), {
      hostPlatform: options.host,
      signal: options.signal
    })
    return await execOpenkododRemote(
      options,
      openkododWindowsNodeCommandLine(runtime, [
        entry,
        flag,
        OPENKODOD_MANAGED_STOP_REQUEST_FILE_FLAG,
        staged
      ])
    )
  } catch (error) {
    // Unconfirmed commands may still be reading the staged request.
    removeStaged = !isUnconfirmedSshCommandTermination(error)
    throw error
  } finally {
    if (removeStaged) {
      await execOpenkododRemote(
        options,
        openkododWindowsSlotOpCommand(options.host, slotDir, 'remove-file', [staged])
      ).catch(() => {})
    }
  }
}
