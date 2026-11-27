/** Adopt serving unrecorded openkodod under the activation fence only when lock, readiness and installed build identify the same process. Never kill it without census; launching another loses the instance lock. Normal update admission handles version changes. */
import { OPENKODOD_LOCK_FILE_NAME } from '../../openkodod/instance-lock/openkodod-instance-lock'
import {
  parseOpenkododInstanceLockRecord,
  type OpenkododLockRecord
} from '../../openkodod/instance-lock/openkodod-instance-lock-record'
import { compareOpenkododProcessIdentity } from '../../openkodod/instance-lock/openkodod-process-start-time'
import type { OpenkododActivationRecord } from '../../managed-server/activation/openkodod-activation-record'
import {
  readOpenkododActivationRecord,
  writeOpenkododActivationRecord
} from '../../managed-server/activation/openkodod-activation-record-store'
import { evaluateOpenkododActivation } from '../../managed-server/activation/openkodod-activation-gate'
import { withOpenkododActivationLock } from '../../managed-server/activation/openkodod-activation-lock'
import { sameOpenkododActivationRecord } from '../../managed-server/activation/openkodod-activation-transaction'
import { readOpenkododActivationTransaction } from '../../managed-server/activation/openkodod-activation-transaction-store'
import { readRemoteOpenkododManagedStopTarget } from '../../managed-server/lifecycle/openkodod-managed-remote-stop'
import {
  openkododSlotDir,
  resolveOpenkododSlotIdentity,
  type OpenkododSlotOptions
} from '../../managed-server/activation/openkodod-recovery-slot'
import { OPENKODOD_PID_FILENAME } from '../../managed-server/install/openkodod-remote-host-support'
import {
  parseOpenkododReadinessWaitOutput,
  readOpenkododReadinessNowCommand
} from '../../managed-server/install/openkodod-remote-readiness-wait'
import { readBoundedOpenkododRemoteRecord } from '../../managed-server/install/openkodod-remote-record-file'
import { execOpenkododRemote } from '../../managed-server/install/openkodod-remote-runtime-control'
import {
  OPENKODOD_INSTALL_MODEL,
  remoteInstallDirName,
  remoteInstallVersionDirRegex
} from '../../managed-server/install/remote-install-model'
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import { joinRemotePath } from '../../ssh/remote-host/ssh-remote-platform'
import {
  readWslGuestIdentity,
  wslGuestOpenkododIncarnation,
  type WslGuestIdentity
} from '../execution/wsl-guest-process-identity'
import type { WslOpenkododInstanceLockRead } from './wsl-openkodod-connect-state-snapshot'

const LOCK_RECORD_MAX_BYTES = 64 * 1024
const UNRECORDED_OPENKODOD_CODE = 'wsl_openkodod_unrecorded_instance_unverifiable'

export type WslOpenkododAdoption =
  | { outcome: 'none' }
  | { outcome: 'adopted'; version: string; pid: number; record: OpenkododActivationRecord }

export class WslOpenkododUnrecordedInstanceError extends Error {
  readonly code = UNRECORDED_OPENKODOD_CODE
  constructor(message: string) {
    super(message)
    this.name = 'WslOpenkododUnrecordedInstanceError'
  }
}

type LockHolder = { pid: number; version: string }

async function readLiveLockHolder(
  slot: OpenkododSlotOptions,
  preRead?: WslOpenkododInstanceLockRead
): Promise<LockHolder | null> {
  const lockPath = joinRemotePath(slot.host, slot.userDataDir, OPENKODOD_LOCK_FILE_NAME)
  const read =
    preRead ?? (await readBoundedOpenkododRemoteRecord(slot, lockPath, LOCK_RECORD_MAX_BYTES))
  const lock = read.state === 'present' ? parseOpenkododInstanceLockRecord(read.raw) : null
  // Desktop-role or malformed locks identify no openkodod to adopt.
  if (!lock || lock.role === 'desktop') {
    return null
  }
  // Adopt only proven-live holders; otherwise let the host's instance lock arbitrate launch.
  // The snapshot's identity counts only if it was read for this same pid.
  const known =
    preRead?.state === 'present' && preRead.holder?.pid === lock.pid ? preRead.holder.guest : null
  return (await lockHolderLiveness(slot, lock, known)) === 'live'
    ? { pid: lock.pid, version: lock.version }
    : null
}

type LockHolderLiveness = 'live' | 'unverifiable' | 'exited'

/** A PID is no identity after a distro restart reuses it: the lock's boot id and start ticks are. */
async function lockHolderLiveness(
  slot: OpenkododSlotOptions,
  lock: OpenkododLockRecord,
  known: WslGuestIdentity | null = null
): Promise<LockHolderLiveness> {
  const guest = known ?? (await readWslGuestIdentity(slot.conn, lock.pid))
  if (!guest) {
    return 'unverifiable'
  }
  const incarnation = wslGuestOpenkododIncarnation(guest)
  // The guest answered, and no process has that PID.
  if (!incarnation) {
    return 'exited'
  }
  // Compare boot IDs case-insensitively because readers normalize them.
  const recorded = lock.bootId ? { ...lock, bootId: lock.bootId.toLowerCase() } : lock
  const verdict = compareOpenkododProcessIdentity(lock.pid, recorded, {
    incarnation: () => incarnation,
    // Ignore wall-clock starts: guest clocks jump after host sleep.
    startedAtMs: () => null,
    platform: 'linux'
  })
  return verdict === 'matches' ? 'live' : verdict === 'differs' ? 'exited' : 'unverifiable'
}

async function readSlotPid(slot: OpenkododSlotOptions, version: string): Promise<number | null> {
  const pidFile = joinRemotePath(slot.host, openkododSlotDir(slot, version), OPENKODOD_PID_FILENAME)
  const raw = await execOpenkododRemote(slot, `cat ${quotePosixShell(pidFile)} 2>/dev/null || true`)
  const pid = Number.parseInt(raw.trim(), 10)
  return Number.isSafeInteger(pid) && pid > 0 ? pid : null
}

/** The holder's slot must publish readiness for this pid, from the build installed there. */
async function proveHolderServesItsSlot(
  slot: OpenkododSlotOptions,
  holder: LockHolder
): Promise<void> {
  const label = `An openkodod (pid ${holder.pid}, ${holder.version}) is running in this distro but is not the recorded one`
  const dirName = remoteInstallDirName(OPENKODOD_INSTALL_MODEL, holder.version)
  if (!remoteInstallVersionDirRegex(OPENKODOD_INSTALL_MODEL).test(dirName)) {
    throw new WslOpenkododUnrecordedInstanceError(`${label}, and its version is not a slot name.`)
  }
  const target = await readRemoteOpenkododManagedStopTarget(slot, holder.version)
  if (target.state !== 'ready' || target.context.instance.pid !== holder.pid) {
    throw new WslOpenkododUnrecordedInstanceError(
      `${label}, and it cannot be identified: ${target.state === 'refused' ? target.reason : 'its readiness names another process.'}`
    )
  }
  const identity = await resolveOpenkododSlotIdentity(slot, holder.version)
  const readiness = parseOpenkododReadinessWaitOutput(
    slot.host,
    await execOpenkododRemote(slot, readOpenkododReadinessNowCommand(slot.host, identity.remoteDir))
  )
  const verdict = evaluateOpenkododActivation(
    readiness.state === 'ready' ? readiness.readiness : null,
    {
      buildHash: identity.buildHash,
      fullVersion: identity.version
    }
  )
  if (verdict.decision === 'reject') {
    throw new WslOpenkododUnrecordedInstanceError(`${label}, and ${verdict.reason}`)
  }
}

function adoptedRecord(
  record: OpenkododActivationRecord,
  version: string,
  now: Date
): OpenkododActivationRecord {
  if (record.active === version) {
    return record
  }
  const { activeAppVersion, previousAppVersion: _previousAppVersion, ...rest } = record
  return {
    ...rest,
    active: version,
    previous: record.active ?? record.previous,
    ...(record.active && activeAppVersion ? { previousAppVersion: activeAppVersion } : {}),
    activatedAt: now.toISOString(),
    // Prelaunch snapshot belongs to another activation; rollback must not restore it.
    snapshot: null
  }
}

/** Adopt lock owners missing from record/pid file only with proof; otherwise refuse rather than launch into an occupied instance lock. */
export async function adoptUnrecordedWslOpenkodod(
  slot: OpenkododSlotOptions,
  record: OpenkododActivationRecord,
  now: () => Date = () => new Date(),
  /** This connect's snapshot of the lock; the fenced re-check below always reads the host. */
  preReadLock?: WslOpenkododInstanceLockRead
): Promise<WslOpenkododAdoption> {
  const holder = await readLiveLockHolder(slot, preReadLock)
  if (!holder) {
    return { outcome: 'none' }
  }
  if (
    record.active === holder.version &&
    (await readSlotPid(slot, holder.version)) === holder.pid
  ) {
    return { outcome: 'none' }
  }
  await proveHolderServesItsSlot(slot, holder)
  return withOpenkododActivationLock(
    slot,
    async () => {
      const current = await readOpenkododActivationRecord(slot)
      if (!sameOpenkododActivationRecord(current, record)) {
        throw new WslOpenkododUnrecordedInstanceError(
          'The activation record changed while an unrecorded openkodod was being adopted. Retry.'
        )
      }
      if (await readOpenkododActivationTransaction(slot)) {
        throw new WslOpenkododUnrecordedInstanceError(
          'An interrupted activation is pending, so an unrecorded openkodod cannot be adopted yet.'
        )
      }
      const again = await readLiveLockHolder(slot)
      if (again?.pid !== holder.pid || again.version !== holder.version) {
        throw new WslOpenkododUnrecordedInstanceError(
          'The unrecorded openkodod changed while it was being adopted. Retry.'
        )
      }
      const pidFile = joinRemotePath(
        slot.host,
        openkododSlotDir(slot, holder.version),
        OPENKODOD_PID_FILENAME
      )
      await execOpenkododRemote(
        slot,
        `(umask 077 && printf '%s\\n' ${String(holder.pid)} > ${quotePosixShell(pidFile)})`
      )
      const next = adoptedRecord(current, holder.version, now())
      if (next !== current) {
        await writeOpenkododActivationRecord(slot, next)
      }
      return {
        outcome: 'adopted' as const,
        version: holder.version,
        pid: holder.pid,
        record: next
      }
    },
    () => {
      throw new WslOpenkododUnrecordedInstanceError(
        'Another OpenKodo is changing this distro’s server, so an unrecorded openkodod cannot be adopted now.'
      )
    }
  )
}
