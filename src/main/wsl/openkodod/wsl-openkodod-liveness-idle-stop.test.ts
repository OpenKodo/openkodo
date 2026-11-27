// #46567: an openkodod that said it stopped idle stays down under visible work; a crash still relaunches.
import { describe, expect, it, vi } from 'vitest'
import { UNVERIFIABLE_OPENKODOD_TERMINAL_CENSUS } from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-terminal-census'
import type { WslOpenkododConnection } from './wsl-openkodod-connection-types'
import type { WslOpenkododConnectionStatus } from './wsl-openkodod-connection-status'
import { WslOpenkododLivenessSupervisor } from './wsl-openkodod-liveness-supervisor'

const DISTRO = 'Ubuntu'
// Settle, stopping-list and first-backoff waits fire at once; heartbeats and slow re-verifies never.
const FIRES_BELOW_MS = 30_000

function connection(pid: number): WslOpenkododConnection {
  return {
    distro: DISTRO,
    environmentId: 'wsl:ubuntu',
    localPort: 4000,
    remotePort: 5000,
    fullVersion: '1.0.0',
    pid,
    pairingOffer: '',
    deferredUpdate: null,
    close: async () => {}
  }
}

async function exitOpenkodod(idleStopped: boolean) {
  let clock = 0
  let pid = 1
  let exitWatch: (code: number | null) => void = () => {}
  const published: WslOpenkododConnectionStatus['state'][] = []
  const launches: number[] = []
  let retired = false
  const supervisor = new WslOpenkododLivenessSupervisor({
    manager: {
      ensure: async () => {
        launches.push(pid)
        return connection(pid)
      },
      get: () => (retired ? null : connection(pid)),
      publish: (_distro, status) => published.push(status.state),
      close: async () => {},
      retireListener: async () => {
        retired = true
      }
    },
    readRunning: async () => ({ status: 'confirmed', distros: [DISTRO] }),
    // Same distro boot; openkodod's pid changes once it exits.
    readIdentity: async () => ({ distroInstance: 'boot-1', openkodod: `openkodod-${pid}` }),
    openWatch: async () => ({
      signal: 'ready',
      onExit: (listener) => {
        exitWatch = listener
      },
      close: () => {},
      proving: () => true
    }),
    collectCensus: async () => UNVERIFIABLE_OPENKODOD_TERMINAL_CENSUS,
    wasIdleStopped: () => idleStopped,
    hasUserVisibleWork: () => true,
    deferUntilRunning: () => {},
    monotonicNow: () => clock,
    schedule: (delayMs, task) => {
      let cancelled = false
      if (delayMs < FIRES_BELOW_MS) {
        queueMicrotask(() => {
          if (!cancelled) {
            clock += delayMs
            task()
          }
        })
      }
      return { cancel: () => (cancelled = true) }
    },
    random: () => 0
  })
  await supervisor.connect(DISTRO)
  launches.length = 0
  pid = 2
  exitWatch(0)
  await vi.waitFor(() => expect(published.some((state) => state !== 'reconnecting')).toBe(true))
  await supervisor.dispose()
  return { published, launches }
}

describe('WSL liveness after openkodod exits with its workspace still open', () => {
  it('leaves an idle-stopped openkodod down', async () => {
    const { published, launches } = await exitOpenkodod(true)
    expect(new Set(published)).toEqual(new Set(['idle']))
    expect(launches).toEqual([])
  })

  it('relaunches one that crashed', async () => {
    const { published, launches } = await exitOpenkodod(false)
    expect(published).toEqual(['reconnecting', 'ready'])
    expect(launches).toEqual([2])
  })
})
