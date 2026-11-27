// Lock before profile load to prevent concurrent writers; terminal daemons own separate endpoints
// and deliberately survive runtime lock release and restart.
import { randomUUID } from 'node:crypto'
import { linkSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { hostname, userInfo } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import {
  compareOpenkododProcessIdentity,
  readOpenkododProcessIncarnation,
  readOpenkododProcessName,
  readOpenkododProcessStartedAtMs,
  type OpenkododProcessIdentityVerdict,
  type OpenkododProcessIncarnation
} from './openkodod-process-start-time'
import {
  assertOpenkododDataRootIsPrivate,
  OpenkododInstanceLockError,
  type OpenkododDataRootPrivacyHooks
} from './openkodod-data-root-privacy'
import {
  hasErrorCode,
  isProcessAlive
} from '../../daemon/endpoint/identity/daemon-process-inspection'
import { profileStateAccessMachineIdentity } from '../../persistence/profile-state/access/profile-state-access-identity'
import { openkododDataRootIsOnLocalDisk } from './openkodod-data-root-locality'
import type { OpenkododReclaimHintRuntime } from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-stale-lock-reclaim'
import { reclaimedUnexpectedExit } from '../host-lifecycle/openkodod-unexpected-exit'
import type { OpenkododUnexpectedExit } from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-unexpected-exit'
import {
  openkododLockHolderLocality,
  openkododLockHolderUnverifiableError
} from './openkodod-lock-holder-locality'
import {
  openkododLockPeer,
  openkododLockSelf,
  openkododPeerIsLiveCloneMachine
} from './openkodod-lock-clone-machine'
import {
  MAX_OPENKODOD_LOCK_BYTES,
  readBoundedLockFile,
  reclaimAndPublish,
  unlinkQuietly,
  type OpenkododLockRecoveryOwner
} from './openkodod-instance-lock-reclaim'
import {
  describeLockHolder,
  parseOpenkododInstanceLockRecord,
  type OpenkododLockRecord
} from './openkodod-instance-lock-record'
import {
  holdOpenkododInstanceLock,
  type OpenkododInstanceLock
} from './openkodod-instance-lock-hold'

export const OPENKODOD_LOCK_FILE_NAME = 'openkodod.lock'
// Allow old torn writes time to complete before treating garbled records as abandoned.
const GARBLED_LOCK_GRACE_MS = 10_000

export type OpenkododInstanceLockHooks = OpenkododDataRootPrivacyHooks & {
  identity?: () => string
  version?: () => string
  now?: () => Date
  /** EPERM still proves the process exists. */
  processIsAlive?: (pid: number) => boolean
  startedAtMs?: (pid: number) => number | null
  incarnation?: (pid: number) => OpenkododProcessIncarnation | null
  ownerUid?: (pid: number) => number | null
  processName?: (pid: number) => string | null
  /** Only differs can reject a live PID’s identity. */
  holderIdentity?: (record: OpenkododLockRecord) => OpenkododProcessIdentityVerdict
  /** Desktop callers must first hold Electron’s single-instance lock to reclaim desktop records. */
  role?: 'openkodod' | 'desktop'
  /** Tighten and verify data-root permissions; defaults to on for the openkodod role only. */
  enforcePrivateDataRoot?: boolean
  machineIdentity?: () => string | null
  /** Establishes locality for legacy machine-less records. */
  dataRootIsOnLocalDisk?: (dataRoot: string) => boolean
  /** Explicit stale-reclaim confirmation permits judging otherwise unverifiable PIDs locally. */
  reclaimConfirmed?: (record: OpenkododLockRecord, role: 'holder' | 'recovery-owner') => boolean
  reclaimHintRuntime?: OpenkododReclaimHintRuntime | null
  bootStartedAtMs?: () => number | null
  /** Another process now holds the lock, so this one no longer has the data root to itself. */
  onExclusivityLost?: () => void
}

function defaultIdentity(): string {
  // POSIX names can repeat across containers; filesystem permissions enforce numeric UIDs.
  return process.platform === 'win32'
    ? (userInfo().username ?? 'unknown')
    : String(process.getuid?.() ?? 'unknown')
}

/** Reclaim dead holders only; preserve live or foreign-identity ownership. */
export function acquireOpenkododInstanceLock(
  dataRoot: string,
  hooks: OpenkododInstanceLockHooks = {}
): OpenkododInstanceLock {
  const identity = (hooks.identity ?? defaultIdentity)()
  const isAlive = hooks.processIsAlive ?? isProcessAlive
  const readStartedAt = hooks.startedAtMs ?? readOpenkododProcessStartedAtMs
  const readIncarnation = hooks.incarnation ?? readOpenkododProcessIncarnation
  const holderIdentity =
    hooks.holderIdentity ??
    ((holder: OpenkododLockRecord) =>
      compareOpenkododProcessIdentity(holder.pid, holder, {
        startedAtMs: readStartedAt,
        incarnation: readIncarnation,
        ownerUid: hooks.ownerUid,
        platform: hooks.platform
      }))

  try {
    mkdirSync(dataRoot, { recursive: true, mode: 0o700 })
  } catch (error) {
    throw new OpenkododInstanceLockError(
      'openkodod_data_root_unusable',
      `Cannot create the openkodod data root ${dataRoot}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  // Desktop profiles retain existing permissions; openkodod tightens its own roots.
  if (hooks.enforcePrivateDataRoot ?? (hooks.role ?? 'openkodod') === 'openkodod') {
    assertOpenkododDataRootIsPrivate(dataRoot, hooks)
  }

  const lockPath = join(dataRoot, OPENKODOD_LOCK_FILE_NAME)
  const machineIdentity = (hooks.machineIdentity ?? profileStateAccessMachineIdentity)()
  const record: OpenkododLockRecord = {
    pid: process.pid,
    startedAtMs: readStartedAt(process.pid),
    ...readIncarnation(process.pid),
    identity,
    version: (hooks.version ?? (() => process.env.OPENKODO_VERSION ?? 'unknown'))(),
    acquiredAt: (hooks.now ?? (() => new Date()))().toISOString(),
    nonce: randomUUID(),
    role: hooks.role ?? 'openkodod',
    ...(machineIdentity ? { machineIdentity } : {}),
    host: hostname()
  }
  const serialized = JSON.stringify(record)
  const platform = hooks.platform ?? process.platform
  const self = openkododLockSelf(record, Date.parse(record.acquiredAt), hooks.bootStartedAtMs?.())

  // Stage then hard-link so canonical records are always complete and never overwrite a holder.
  const publishContents = (contents: string): boolean => {
    const staged = `${lockPath}.staged-${process.pid}-${randomUUID()}`
    try {
      writeFileSync(staged, contents, { flag: 'wx', mode: 0o600 })
      linkSync(staged, lockPath)
      return true
    } catch (error) {
      if (hasErrorCode(error, 'EEXIST')) {
        return false
      }
      throw new OpenkododInstanceLockError(
        'openkodod_data_root_unusable',
        `Cannot write the openkodod instance lock ${lockPath}: ${error instanceof Error ? error.message : String(error)}`
      )
    } finally {
      unlinkQuietly(staged)
    }
  }
  const publish = (): boolean => publishContents(serialized)

  const lockFor = (
    previousUnexpectedExit: OpenkododUnexpectedExit | null = null,
    reclaimedContents?: string
  ): OpenkododInstanceLock =>
    holdOpenkododInstanceLock(lockPath, record, publish, {
      previousUnexpectedExit,
      restoreReclaimedRecord: reclaimedContents
        ? () => {
            try {
              publishContents(reclaimedContents)
            } catch {
              // Losing the notice is better than failing the caller's release.
            }
          }
        : undefined,
      onExclusivityLost: hooks.onExclusivityLost ?? (() => {})
    })
  if (publish()) {
    return lockFor()
  }

  const dataRootIsLocal = (): boolean =>
    (hooks.dataRootIsOnLocalDisk ?? openkododDataRootIsOnLocalDisk)(dataRoot)
  const judgedHere = (holder: OpenkododLockRecord, role: 'holder' | 'recovery-owner'): boolean => {
    const peer = openkododLockPeer(holder, role === 'holder' ? lockPath : null)
    const locality = openkododLockHolderLocality(peer, self, dataRootIsLocal, platform)
    return (
      locality === 'local' || (locality === 'unknown' && !!hooks.reclaimConfirmed?.(holder, role))
    )
  }
  const recoveryOwner: OpenkododLockRecoveryOwner = {
    record: serialized,
    exited: (ownerRecord) => {
      const owner = parseOpenkododInstanceLockRecord(ownerRecord)
      return Boolean(
        owner &&
        owner.identity === identity &&
        judgedHere(owner, 'recovery-owner') &&
        (!isAlive(owner.pid) || holderIdentity(owner) === 'differs')
      )
    }
  }

  const existingContents = readBoundedLockFile(lockPath)
  if (existingContents === null) {
    // Unreadable records cannot prove their holder exited.
    throw new OpenkododInstanceLockError(
      'openkodod_instance_lock_unreadable',
      `The openkodod instance lock at ${lockPath} is unreadable or larger than ` +
        `${MAX_OPENKODOD_LOCK_BYTES} bytes. Refusing to reclaim it without proof that its holder ` +
        'has exited. Stop openkodod and remove the stale lock manually.'
    )
  }
  const existing = parseOpenkododInstanceLockRecord(existingContents)
  if (!existing) {
    // Old torn writes become reclaimable only after the writer grace period.
    if (garbledLockIsAbandoned(lockPath)) {
      reclaimAndPublish(lockPath, dataRoot, existingContents, publish, recoveryOwner)
      return lockFor()
    }
    throw new OpenkododInstanceLockError(
      'openkodod_instance_lock_held',
      `The openkodod instance lock at ${lockPath} is still being written by another process. Retry.`
    )
  }
  if (existing.identity !== identity) {
    throw new OpenkododInstanceLockError(
      'openkodod_instance_lock_foreign_identity',
      `The openkodod data root ${dataRoot} is locked by identity ${existing.identity} (pid ` +
        `${existing.pid}); this process runs as ${identity}. Two identities sharing one data ` +
        'root corrupts it. Give each its own OPENKODO_USER_DATA.'
    )
  }
  const holder = openkododLockPeer(existing, lockPath)
  if (!judgedHere(existing, 'holder')) {
    // Foreign/unverifiable PIDs prove neither absence nor reuse here.
    throw openkododLockHolderUnverifiableError({
      holder: `${describeLockHolder(existing)} (pid ${existing.pid}, started ${existing.acquiredAt})`,
      foreign: openkododLockHolderLocality(holder, self, dataRootIsLocal, platform) === 'foreign',
      ...(openkododPeerIsLiveCloneMachine(holder, self, dataRootIsLocal, platform)
        ? { cloneMachine: { role: hooks.role ?? 'openkodod' } }
        : {}),
      dataRoot,
      lockPath,
      hintRuntime:
        hooks.reclaimHintRuntime !== undefined
          ? hooks.reclaimHintRuntime
          : hooks.role === 'desktop'
            ? null
            : { execPath: process.execPath, entry: process.argv[1] }
    })
  }
  // Electron’s already-held lock proves other desktop instances absent despite PID reuse.
  const staleDesktopRecord = hooks.role === 'desktop' && existing.role === 'desktop'
  const verdict = staleDesktopRecord || !isAlive(existing.pid) ? null : holderIdentity(existing)
  if (verdict === 'unproven' && !existing.bootId) {
    throw possiblyReusedPidError(lockPath, existing, hooks.processName ?? readOpenkododProcessName)
  }
  if (verdict !== null && verdict !== 'differs') {
    throw new OpenkododInstanceLockError(
      'openkodod_instance_lock_held',
      `${describeLockHolder(existing)} (pid ${existing.pid}, started ` +
        `${existing.acquiredAt || 'unknown'}) already owns the data root ${dataRoot}. Stop it ` +
        'before starting another, or use a different OPENKODO_USER_DATA.'
    )
  }
  reclaimAndPublish(lockPath, dataRoot, existingContents, publish, recoveryOwner)
  return lockFor(reclaimedUnexpectedExit(existing, record, self.bootStartedAtMs), existingContents)
}

function possiblyReusedPidError(
  lockPath: string,
  existing: OpenkododLockRecord,
  processName: (pid: number) => string | null
): OpenkododInstanceLockError {
  const name = processName(existing.pid)
  const holder = existing.role === 'desktop' ? 'the OpenKodo desktop app' : 'openkodod'
  return new OpenkododInstanceLockError(
    'openkodod_instance_lock_held',
    `The openkodod instance lock at ${lockPath} names pid ${existing.pid}, which is still running ` +
      `(as ${name ? `"${name}"` : 'an unknown program'}). This lock, written by ${holder} at ` +
      `${existing.acquiredAt}, does not record which boot it came from, so OpenKodo cannot tell ` +
      `whether that process is still ${holder} or an unrelated program that reused the PID. ` +
      `If you are sure ${holder} is not running for this data root, delete ${lockPath} and ` +
      'try again, or use a different OPENKODO_USER_DATA.'
  )
}

function garbledLockIsAbandoned(lockPath: string): boolean {
  try {
    return Date.now() - statSync(lockPath).mtimeMs > GARBLED_LOCK_GRACE_MS
  } catch {
    return false
  }
}
