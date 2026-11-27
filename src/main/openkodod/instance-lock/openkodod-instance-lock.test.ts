import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type * as NodeFs from 'node:fs'
import {
  acquireOpenkododInstanceLock,
  OPENKODOD_LOCK_FILE_NAME,
  type OpenkododInstanceLockHooks
} from './openkodod-instance-lock'
import {
  readOpenkododInstanceLockRecord,
  type OpenkododLockRecord
} from './openkodod-instance-lock-record'

// Inject a contender immediately after canonical-lock rename.
const afterLockRename = vi.hoisted((): { next: (() => void) | null; failNext: boolean } => ({
  next: null,
  failNext: false
}))
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeFs>()
  return {
    ...actual,
    renameSync: (from: NodeFs.PathLike, to: NodeFs.PathLike) => {
      if (afterLockRename.failNext && String(from).endsWith('openkodod.lock')) {
        afterLockRename.failNext = false
        throw Object.assign(new Error('EBUSY: resource busy'), { code: 'EBUSY' })
      }
      actual.renameSync(from, to)
      const contender = afterLockRename.next
      if (contender && String(from).endsWith('openkodod.lock')) {
        afterLockRename.next = null
        contender()
      }
    }
  }
})

const roots: string[] = []

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'openkodod-lock-'))
  roots.push(root)
  return root
}

function hooks(overrides: OpenkododInstanceLockHooks = {}): OpenkododInstanceLockHooks {
  return {
    identity: () => 'uid-1000',
    version: () => '1.0.0-test',
    startedAtMs: () => 1_000,
    incarnation: () => null,
    holderIdentity: () => 'matches',
    processIsAlive: () => false,
    machineIdentity: () => 'machine-a',
    dataRootIsOnLocalDisk: () => true,
    ...overrides
  }
}

function persistedRecord(overrides: Partial<OpenkododLockRecord> = {}): OpenkododLockRecord {
  return {
    pid: 424242,
    startedAtMs: 1,
    identity: 'uid-1000',
    version: '1.0.0-test',
    acquiredAt: '2026-01-01T00:00:00.000Z',
    nonce: 'stale',
    ...overrides
  }
}

afterEach(() => {
  afterLockRename.next = null
  afterLockRename.failNext = false
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('acquireOpenkododInstanceLock', () => {
  it('keeps a live holder whose ticks match though its btime-derived start time drifted', () => {
    const root = makeRoot()
    const incarnation = { linuxStartTicks: '1234', bootId: 'boot-a' }
    writeFileSync(
      join(root, OPENKODOD_LOCK_FILE_NAME),
      JSON.stringify(persistedRecord({ startedAtMs: 1_000, ...incarnation }))
    )
    const drifted = {
      processIsAlive: () => true,
      holderIdentity: undefined,
      startedAtMs: () => 158_000,
      incarnation: () => incarnation
    }
    expect(() => acquireOpenkododInstanceLock(root, hooks(drifted))).toThrow(
      expect.objectContaining({ code: 'openkodod_instance_lock_held' })
    )
    const reused = { ...drifted, incarnation: () => ({ ...incarnation, linuxStartTicks: '9' }) }
    expect(acquireOpenkododInstanceLock(root, hooks(reused)).record.nonce).not.toBe('stale')
  })

  it('does not displace a successor published between stale inspection and reclaim', () => {
    const root = makeRoot()
    const lockPath = join(root, OPENKODOD_LOCK_FILE_NAME)
    const successor = persistedRecord({ pid: 777, startedAtMs: 2, nonce: 'successor' })
    writeFileSync(lockPath, JSON.stringify(persistedRecord()))
    let raced = false
    const lockHooks = hooks({
      processIsAlive: () => {
        if (!raced) {
          raced = true
          // Replace after liveness inspection but before the reclaiming rename.
          const displacedPath = `${lockPath}.displaced`
          renameSync(lockPath, displacedPath)
          writeFileSync(lockPath, JSON.stringify(successor), { flag: 'wx', mode: 0o600 })
        }
        return false
      }
    })

    expect(() => acquireOpenkododInstanceLock(root, lockHooks)).toThrow(
      expect.objectContaining({ code: 'openkodod_instance_lock_held' })
    )
    expect(JSON.parse(readFileSync(lockPath, 'utf8')).nonce).toBe('successor')
  })

  it('never reclaims a lock held by a different identity, even a dead one', () => {
    const root = makeRoot()
    writeFileSync(
      join(root, OPENKODOD_LOCK_FILE_NAME),
      JSON.stringify(persistedRecord({ identity: 'uid-2000', nonce: 'other' }))
    )
    expect(() =>
      acquireOpenkododInstanceLock(root, hooks({ processIsAlive: () => false }))
    ).toThrow(expect.objectContaining({ code: 'openkodod_instance_lock_foreign_identity' }))
  })

  it('does not delete a record that a later instance already replaced', () => {
    const root = makeRoot()
    const lock = acquireOpenkododInstanceLock(root, hooks())
    writeFileSync(
      lock.path,
      JSON.stringify(persistedRecord({ pid: 777, startedAtMs: 2, nonce: 'successor' }))
    )
    lock.release()
    expect(JSON.parse(readFileSync(lock.path, 'utf8')).nonce).toBe('successor')
  })
  it('fails closed when the existing lock is not a regular file', () => {
    const root = makeRoot()
    mkdirSync(join(root, OPENKODOD_LOCK_FILE_NAME))

    expect(() => acquireOpenkododInstanceLock(root, hooks())).toThrow(
      expect.objectContaining({ code: 'openkodod_instance_lock_unreadable' })
    )
  })

  it('fails closed without reading an oversized lock into memory', () => {
    const root = makeRoot()
    const lockPath = join(root, OPENKODOD_LOCK_FILE_NAME)
    writeFileSync(lockPath, 'x'.repeat(64 * 1024 + 1))

    expect(() => acquireOpenkododInstanceLock(root, hooks())).toThrow(
      expect.objectContaining({ code: 'openkodod_instance_lock_unreadable' })
    )
    expect(statSync(lockPath).size).toBe(64 * 1024 + 1)
  })

  it.runIf(process.platform !== 'win32')(
    'tightens a group/world-accessible data root rather than refusing when it can',
    () => {
      const root = makeRoot()
      chmodSync(root, 0o755)
      acquireOpenkododInstanceLock(root, hooks())
      expect(statSync(root).mode & 0o777).toBe(0o700)
    }
  )

  // Root owns /tmp, so this wrong-owner fixture requires a non-root caller.
  it.runIf(process.platform !== 'win32' && process.getuid?.() !== 0)(
    'refuses a data root owned by another uid',
    () => {
      const root = makeRoot()
      expect(() => acquireOpenkododInstanceLock('/tmp', hooks())).toThrow(
        expect.objectContaining({ code: 'openkodod_data_root_wrong_owner' })
      )
      expect(acquireOpenkododInstanceLock(root, hooks()).record.identity).toBe('uid-1000')
    }
  )

  it('never judges a holder on another machine by a PID this machine issued', () => {
    const root = makeRoot()
    const lockPath = join(root, OPENKODOD_LOCK_FILE_NAME)
    const remote = persistedRecord({ nonce: 'machine-b', machineIdentity: 'machine-b' })
    writeFileSync(lockPath, JSON.stringify(remote))
    for (const role of ['openkodod', 'desktop'] as const) {
      expect(() => acquireOpenkododInstanceLock(root, hooks({ role }))).toThrow(
        expect.objectContaining({
          code: 'openkodod_instance_lock_holder_unverifiable',
          message: expect.stringContaining('from another machine')
        })
      )
    }
    expect(readOpenkododInstanceLockRecord(lockPath)?.nonce).toBe('machine-b')
    expect(readdirSync(root)).toEqual([OPENKODOD_LOCK_FILE_NAME])

    writeFileSync(lockPath, JSON.stringify({ ...remote, machineIdentity: 'machine-a' }))
    const lock = acquireOpenkododInstanceLock(root, hooks())
    expect(readOpenkododInstanceLockRecord(lockPath)).toMatchObject({
      nonce: lock.record.nonce,
      machineIdentity: 'machine-a'
    })
  })

  it('never lets a confirmed reclaim take a lock another machine id holds', () => {
    const root = makeRoot()
    const lockPath = join(root, OPENKODOD_LOCK_FILE_NAME)
    writeFileSync(lockPath, JSON.stringify(persistedRecord({ machineIdentity: 'machine-b' })))
    expect(() =>
      acquireOpenkododInstanceLock(root, hooks({ reclaimConfirmed: () => true }))
    ).toThrow(expect.objectContaining({ code: 'openkodod_instance_lock_holder_unverifiable' }))
    expect(readOpenkododInstanceLockRecord(lockPath)?.nonce).toBe('stale')
  })

  it('reclaims a record naming no machine only when it is provably from this one', () => {
    const root = makeRoot()
    const lockPath = join(root, OPENKODOD_LOCK_FILE_NAME)
    writeFileSync(lockPath, JSON.stringify(persistedRecord({ bootId: 'boot-1' })))
    const shared = { dataRootIsOnLocalDisk: () => false }
    expect(() => acquireOpenkododInstanceLock(root, hooks(shared))).toThrow(
      expect.objectContaining({ code: 'openkodod_instance_lock_holder_unverifiable' })
    )
    expect(() =>
      acquireOpenkododInstanceLock(root, hooks({ ...shared, machineIdentity: () => null }))
    ).toThrow(expect.objectContaining({ code: 'openkodod_instance_lock_holder_unverifiable' }))
    expect(readOpenkododInstanceLockRecord(lockPath)?.nonce).toBe('stale')

    const sameBoot = hooks({
      ...shared,
      incarnation: () => ({ linuxStartTicks: '1', bootId: 'boot-1' })
    })
    acquireOpenkododInstanceLock(root, sameBoot).release()
    writeFileSync(lockPath, JSON.stringify(persistedRecord()))
    expect(acquireOpenkododInstanceLock(root, hooks()).record.machineIdentity).toBe('machine-a')
  })

  it('admits one owner when reclaimers of the same stale lock interleave', () => {
    const root = makeRoot()
    const lockPath = join(root, OPENKODOD_LOCK_FILE_NAME)
    writeFileSync(lockPath, JSON.stringify(persistedRecord()))
    const owners: { record: OpenkododLockRecord }[] = []
    const failures: unknown[] = []
    const attempt = (lockHooks: OpenkododInstanceLockHooks): void => {
      try {
        owners.push(acquireOpenkododInstanceLock(root, lockHooks))
      } catch (error) {
        failures.push(error)
      }
    }
    let raced = false
    // B replaces A’s inspected stale lock; C races the vacant path if B’s live lock is renamed.
    attempt(
      hooks({
        processIsAlive: () => {
          if (!raced) {
            raced = true
            attempt(hooks())
            afterLockRename.next = () => attempt(hooks())
          }
          return false
        }
      })
    )

    expect(owners).toHaveLength(1)
    expect(readOpenkododInstanceLockRecord(lockPath)?.nonce).toBe(owners[0]?.record.nonce)
    expect(failures).toEqual([expect.objectContaining({ code: 'openkodod_instance_lock_held' })])
    expect(readdirSync(root)).toEqual([OPENKODOD_LOCK_FILE_NAME])
  })

  it.runIf(process.platform !== 'win32')(
    "leaves the desktop profile's permissions as they were",
    () => {
      const root = makeRoot()
      chmodSync(root, 0o755)
      const restricted: string[] = []
      acquireOpenkododInstanceLock(root, hooks({ role: 'desktop' })).release()
      acquireOpenkododInstanceLock(
        root,
        hooks({
          role: 'desktop',
          platform: 'win32',
          restrictWindowsDataRoot: (path) => restricted.push(path) > 0
        })
      ).release()
      expect(restricted).toEqual([])
      expect(statSync(root).mode & 0o777).toBe(0o755)
    }
  )
})

describe('instance lock heartbeat', () => {
  function withHeartbeat(run: () => void): void {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    try {
      run()
    } finally {
      vi.useRealTimers()
    }
  }

  it('restores a lock removed while held, so a second starter is still refused', () =>
    withHeartbeat(() => {
      const root = makeRoot()
      const onExclusivityLost = vi.fn()
      const lock = acquireOpenkododInstanceLock(root, hooks({ onExclusivityLost }))
      rmSync(lock.path)
      vi.advanceTimersByTime(60_000)
      expect(readOpenkododInstanceLockRecord(lock.path)?.nonce).toBe(lock.record.nonce)
      expect(() =>
        acquireOpenkododInstanceLock(root, hooks({ processIsAlive: () => true }))
      ).toThrow(expect.objectContaining({ code: 'openkodod_instance_lock_held' }))
      expect(onExclusivityLost).not.toHaveBeenCalled()
      lock.release()
    }))

  it('yields once another process holds the lock, leaving its record alone', () =>
    withHeartbeat(() => {
      const root = makeRoot()
      const onExclusivityLost = vi.fn()
      const lock = acquireOpenkododInstanceLock(root, hooks({ onExclusivityLost }))
      rmSync(lock.path)
      const successor = acquireOpenkododInstanceLock(root, hooks())
      vi.advanceTimersByTime(2 * 60_000)
      expect(onExclusivityLost).toHaveBeenCalledOnce()
      lock.release()
      expect(readOpenkododInstanceLockRecord(lock.path)?.nonce).toBe(successor.record.nonce)
      successor.release()
    }))
})
