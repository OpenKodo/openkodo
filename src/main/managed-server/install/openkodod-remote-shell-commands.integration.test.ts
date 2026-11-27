// Execute generated commands in /bin/sh to catch quoting and shell-semantic errors.
import { execFileSync, spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  exportProfileStateJson,
  importProfileStateJson
} from '../../persistence/profile-state/documents/profile-state-documents'
import { openProfileStateDatabase } from '../../persistence/profile-state/database/profile-state-database'
import { openkododLivenessProbeCommand, parseOpenkododLiveness } from './openkodod-remote-launch'
import { OPENKODOD_PID_FILENAME } from './openkodod-remote-host-support'
import { parseOpenkododStopOutcome, stopOpenkododCommand } from './openkodod-remote-process-control'
import {
  captureOpenkododStateSnapshotCommand,
  compareOpenkododStateSnapshotCommand,
  openkododSnapshotIsUnchanged,
  parseOpenkododSnapshotCapture,
  parseOpenkododSnapshotRestore,
  restoreOpenkododStateSnapshotCommand
} from '../host-state/openkodod-state-snapshot'
import { getRemoteHostPlatform } from '../../ssh/remote-host/ssh-remote-platform'

const host = getRemoteHostPlatform('linux-x64')
let root = ''
let dataDir = ''
let snapshotDir = ''
const baseDir = (): string => join(root, '.openkodo-remote')
let versionDir = ''
const launchedPids = new Set<number>()
// Every case runs the Linux-host commands through /bin/sh, which Windows does not have.
const describeOnPosix = process.platform === 'win32' ? describe.skip : describe

function sh(command: string): string {
  return execFileSync('/bin/sh', ['-c', command], { encoding: 'utf8' })
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'openkodod-shell-'))
  dataDir = join(root, '.openkodo')
  snapshotDir = join(root, 'snapshots', 'pre-0.2.0+bb01-1000')
  versionDir = join(root, '.openkodo-remote', 'openkodod-0.2.0+bb01')
  mkdirSync(join(dataDir, 'profiles', 'p1'), { recursive: true })
  mkdirSync(join(dataDir, 'daemon'), { recursive: true })
  mkdirSync(versionDir, { recursive: true })
  writeFileSync(join(dataDir, 'openkodo-profile-index.json'), '{"v":"before"}')
  writeFileSync(join(dataDir, 'profiles', 'p1', 'openkodo-data.json'), '{"repos":"before"}')
  writeFileSync(join(dataDir, 'daemon', 'daemon.sock.token'), 'live-daemon-token')
})

afterEach(() => {
  for (const pid of launchedPids) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {}
  }
  launchedPids.clear()
  rmSync(root, { recursive: true, force: true })
})

describeOnPosix('state snapshot commands, run for real', () => {
  it('requires an intact comparison snapshot before an older build can restart', () => {
    expect(
      openkododSnapshotIsUnchanged(
        sh(compareOpenkododStateSnapshotCommand(host, dataDir, snapshotDir, baseDir()))
      )
    ).toBe(false)
    sh(captureOpenkododStateSnapshotCommand(host, dataDir, snapshotDir, baseDir()))
    writeFileSync(join(snapshotDir, 'state.tar'), 'not an archive')
    expect(
      openkododSnapshotIsUnchanged(
        sh(compareOpenkododStateSnapshotCommand(host, dataDir, snapshotDir, baseDir()))
      )
    ).toBe(false)
    expect(readFileSync(join(dataDir, 'profiles', 'p1', 'openkodo-data.json'), 'utf8')).toBe(
      '{"repos":"before"}'
    )
  })

  it('rejects symlinked profile state that a tar snapshot does not preserve', () => {
    const external = join(root, 'external-profile')
    mkdirSync(external)
    writeFileSync(join(external, 'openkodo-data.json'), '{"before":true}')
    const profile = join(dataDir, 'profiles', 'linked')
    symlinkSync(external, profile)

    expect(
      parseOpenkododSnapshotCapture(
        sh(captureOpenkododStateSnapshotCommand(host, dataDir, snapshotDir, baseDir()))
      )
    ).toBe('failed')

    mkdirSync(snapshotDir, { recursive: true })
    execFileSync('tar', ['-C', dataDir, '-cf', join(snapshotDir, 'state.tar'), 'profiles'])
    writeFileSync(join(external, 'openkodo-data.json'), '{"candidate":true}')
    expect(
      openkododSnapshotIsUnchanged(
        sh(compareOpenkododStateSnapshotCommand(host, dataDir, snapshotDir, baseDir()))
      )
    ).toBe(false)
    expect(readFileSync(join(external, 'openkodo-data.json'), 'utf8')).toBe('{"candidate":true}')
  })

  it('round-trips a quiescent SQLite profile database with its WAL sidecars', () => {
    const profileDirectory = join(dataDir, 'profiles', 'p1')
    const databasePath = join(profileDirectory, 'profile-state.db')
    const opened = openProfileStateDatabase(databasePath, 'p1')
    try {
      importProfileStateJson(
        opened.db,
        JSON.stringify({ settings: { theme: 'dark' }, snapshotMarker: 'before' })
      )
      // Keep the connection open so quiescent WAL/SHM files remain inside the archive boundary.
      expect(existsSync(`${databasePath}-wal`)).toBe(true)
      expect(
        parseOpenkododSnapshotCapture(
          sh(captureOpenkododStateSnapshotCommand(host, dataDir, snapshotDir, baseDir()))
        )
      ).toBe('captured')
    } finally {
      opened.db.close()
    }

    const changed = openProfileStateDatabase(databasePath, 'p1')
    try {
      importProfileStateJson(
        changed.db,
        JSON.stringify({ settings: { theme: 'light' }, snapshotMarker: 'after' })
      )
    } finally {
      changed.db.close()
    }
    expect(
      parseOpenkododSnapshotRestore(
        sh(restoreOpenkododStateSnapshotCommand(host, dataDir, snapshotDir, baseDir()))
      )
    ).toBe('restored')

    const restored = openProfileStateDatabase(databasePath, 'p1')
    try {
      expect(JSON.parse(exportProfileStateJson(restored.db))).toEqual({
        settings: { theme: 'dark' },
        snapshotMarker: 'before'
      })
    } finally {
      restored.db.close()
    }
  })

  it('leaves the live daemon runtime dir untouched through capture and restore', () => {
    sh(captureOpenkododStateSnapshotCommand(host, dataDir, snapshotDir, baseDir()))
    // Daemon tokens can change during rollback; restoring them would break terminal adoption.
    writeFileSync(join(dataDir, 'daemon', 'daemon.sock.token'), 'token-after-restart')
    sh(restoreOpenkododStateSnapshotCommand(host, dataDir, snapshotDir, baseDir()))
    expect(readFileSync(join(dataDir, 'daemon', 'daemon.sock.token'), 'utf8')).toBe(
      'token-after-restart'
    )
  })

  it('survives a data root whose path contains a quote and a space', () => {
    const nasty = join(root, `it's a dir`)
    mkdirSync(join(nasty, 'profiles'), { recursive: true })
    writeFileSync(join(nasty, 'openkodo-profile-index.json'), '{"v":"quoted"}')
    expect(
      parseOpenkododSnapshotCapture(
        sh(captureOpenkododStateSnapshotCommand(host, nasty, snapshotDir, baseDir()))
      )
    ).toBe('captured')
    expect(
      openkododSnapshotIsUnchanged(
        sh(compareOpenkododStateSnapshotCommand(host, nasty, snapshotDir, baseDir()))
      )
    ).toBe(true)
    writeFileSync(join(nasty, 'openkodo-profile-index.json'), '{"v":"changed"}')
    expect(
      openkododSnapshotIsUnchanged(
        sh(compareOpenkododStateSnapshotCommand(host, nasty, snapshotDir, baseDir()))
      )
    ).toBe(false)
    expect(
      parseOpenkododSnapshotRestore(
        sh(restoreOpenkododStateSnapshotCommand(host, nasty, snapshotDir, baseDir()))
      )
    ).toBe('restored')
    expect(readFileSync(join(nasty, 'openkodo-profile-index.json'), 'utf8')).toBe('{"v":"quoted"}')
  })
})

describeOnPosix('liveness and stop commands, run for real', () => {
  it('reports a reused PID running something other than this slot as DEAD', () => {
    const stranger = spawn('/bin/sh', ['-c', 'sleep 30'], { stdio: 'ignore' })
    try {
      writeFileSync(join(versionDir, OPENKODOD_PID_FILENAME), String(stranger.pid))
      expect(parseOpenkododLiveness(sh(openkododLivenessProbeCommand(host, versionDir)))).toBe(
        'DEAD'
      )
    } finally {
      stranger.kill('SIGKILL')
    }
  })

  // Slim Linux images ship no ps; after a reboot the recorded PID often names a new process (#34149).
  it.runIf(process.platform === 'linux')(
    'reads argv from /proc on a host without ps, so a reused PID is DEAD and the slot is LIVE',
    () => {
      const noPs = 'ps() { return 127; };'
      const stranger = spawn('/bin/sh', ['-c', 'sleep 30'], { stdio: 'ignore' })
      const slot = spawn(
        process.execPath,
        ['-e', 'setTimeout(() => {}, 30000)', join(versionDir, 'openkodod.js')],
        { stdio: 'ignore' }
      )
      try {
        writeFileSync(join(versionDir, OPENKODOD_PID_FILENAME), String(stranger.pid))
        expect(
          parseOpenkododLiveness(sh(`${noPs} ${openkododLivenessProbeCommand(host, versionDir)}`))
        ).toBe('DEAD')
        writeFileSync(join(versionDir, OPENKODOD_PID_FILENAME), String(slot.pid))
        expect(
          parseOpenkododLiveness(sh(`${noPs} ${openkododLivenessProbeCommand(host, versionDir)}`))
        ).toBe('LIVE')
      } finally {
        stranger.kill('SIGKILL')
        slot.kill('SIGKILL')
      }
    }
  )

  // zsh and ksh print ESRCH lowercase; reading that as UNKNOWN left a dead server never restarted (#34149).
  describe('a recorded PID that no longer exists', () => {
    const exitedPid = (): string => sh('echo $$').trim()
    const killSays = (message: string): string => `kill() { echo "${message}" >&2; return 1; };`

    it.each([
      ['bash', 'bash: kill: (4242) - No such process'],
      ['zsh', 'zsh:kill:1: kill 4242 failed: no such process']
    ])('is DEAD when kill answers like %s', (_shell, message) => {
      writeFileSync(join(versionDir, OPENKODOD_PID_FILENAME), exitedPid())
      expect(
        parseOpenkododLiveness(
          sh(`${killSays(message)} ${openkododLivenessProbeCommand(host, versionDir)}`)
        )
      ).toBe('DEAD')
    })

    it('stays UNKNOWN when kill is denied rather than told the PID is gone', () => {
      writeFileSync(join(versionDir, OPENKODOD_PID_FILENAME), exitedPid())
      const denied = killSays('zsh:kill:1: kill 4242 failed: operation not permitted')
      expect(
        parseOpenkododLiveness(sh(`${denied} ${openkododLivenessProbeCommand(host, versionDir)}`))
      ).toBe('UNKNOWN')
    })

    it.runIf(existsSync('/bin/zsh'))('is DEAD when the login shell is zsh', () => {
      writeFileSync(join(versionDir, OPENKODOD_PID_FILENAME), exitedPid())
      const probe = execFileSync(
        '/bin/zsh',
        ['-c', openkododLivenessProbeCommand(host, versionDir)],
        {
          encoding: 'utf8'
        }
      )
      expect(parseOpenkododLiveness(probe)).toBe('DEAD')
    })
  })

  it.each(['openkodod.js', 'openkodod-server.js'])(
    'reports LIVE and stops a running %s even without entry files',
    async (entry) => {
      const child = spawn(
        process.execPath,
        ['-e', 'setTimeout(() => {}, 30000)', join(versionDir, entry)],
        { stdio: 'ignore' }
      )
      try {
        writeFileSync(join(versionDir, OPENKODOD_PID_FILENAME), String(child.pid))
        expect(parseOpenkododLiveness(sh(openkododLivenessProbeCommand(host, versionDir)))).toBe(
          'LIVE'
        )

        const exited = new Promise<NodeJS.Signals | null>((resolve) =>
          child.once('exit', (_code, signal) => resolve(signal))
        )
        expect(
          parseOpenkododStopOutcome(
            sh(stopOpenkododCommand(host, versionDir, { waitSeconds: 10, justLaunched: true }))
          )
        ).toBe('stopped')
        expect(await exited).toBe('SIGTERM')
        expect(parseOpenkododLiveness(sh(openkododLivenessProbeCommand(host, versionDir)))).toBe(
          'DEAD'
        )
      } finally {
        child.kill('SIGKILL')
      }
    }
  )

  // kill -0 alone would keep exited zombies live, blocking stop completion and GC.
})
