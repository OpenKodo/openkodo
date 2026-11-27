import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpenkododTerminalCensus } from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-terminal-census'
import type { OpenkododSlotOptions } from '../../managed-server/activation/openkodod-recovery-slot'
import type { OpenkododRemoteContext } from '../../managed-server/install/openkodod-remote-context'
import type { ServeReadiness } from '../../server/serve-readiness'
import type { WslOpenkododHostTarget } from './wsl-openkodod-host-target'
import type { WslOpenkododIncumbent } from './wsl-openkodod-incumbent'

const { stopIncumbent, wakeStoppedManagedOpenkodod } = vi.hoisted(() => ({
  stopIncumbent: vi.fn(),
  wakeStoppedManagedOpenkodod: vi.fn()
}))
// The real fenced stop runs; only the lock, record and remote stop are faked.
vi.mock('../../managed-server/activation/openkodod-activation-lock', () => ({
  withOpenkododActivationLock: async (_slot: unknown, run: (lock: unknown) => unknown) =>
    await run({ retain: () => {} })
}))
vi.mock('../../managed-server/activation/openkodod-activation-record-store', () => ({
  readOpenkododActivationRecord: async () => ({ active: '1.4.269' })
}))
vi.mock('../../managed-server/lifecycle/openkodod-managed-remote-stop', () => ({
  readRemoteOpenkododManagedStopTarget: async () => ({ state: 'ready', context: {} })
}))
vi.mock('../../managed-server/lifecycle/openkodod-rollback-terminal-barrier', () => ({
  stopIncumbentBehindTerminalBarrier: stopIncumbent
}))
vi.mock('../../managed-server/lifecycle/openkodod-managed-wake', () => ({
  wakeStoppedManagedOpenkodod
}))

const { relaunchAsWslHost } = await import('./wsl-openkodod-host-relaunch')

const IDLE: OpenkododTerminalCensus = {
  liveSessions: 0,
  startedSinceActivation: 0,
  daemonProtocolVersion: null,
  inProcessSessions: 0,
  chatSessions: 0,
  answered: true
}

let environment = 0

function relaunch(census: OpenkododTerminalCensus, recounted: OpenkododTerminalCensus = census) {
  const incumbent: WslOpenkododIncumbent = {
    census,
    readiness: null,
    recount: async () => recounted,
    releaseAdmission: async () => {}
  }
  // Restarts are remembered per environment for the session; keep cases independent.
  environment += 1
  return relaunchAsWslHost({
    environmentId: `wsl-${environment}`,
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the stubbed incumbent read and stop never touch the context.
    context: {} as OpenkododRemoteContext<WslOpenkododHostTarget>,
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the mocked lock, record, stop and wake never read the slot.
    slot: {} as OpenkododSlotOptions,
    fullVersion: '1.4.269',
    paired: null,
    moveRunning: false,
    readIncumbent: async () => incumbent,
    reprobe: async () => ({
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the relaunch only passes readiness through.
      readiness: {} as ServeReadiness,
      launch: 'wsl-host' as const
    })
  })
}

describe('relaunchAsWslHost', () => {
  beforeEach(() => {
    stopIncumbent.mockReset()
    wakeStoppedManagedOpenkodod.mockReset()
    stopIncumbent.mockResolvedValue({ state: 'retired' })
    wakeStoppedManagedOpenkodod.mockResolvedValue({ outcome: 'started' })
  })

  it('restarts a server with no terminals and no chats', async () => {
    const result = await relaunch(IDLE)
    expect(result).toMatchObject({ ready: true, deferredUpdate: null })
    expect(stopIncumbent).toHaveBeenCalledTimes(1)
    expect(wakeStoppedManagedOpenkodod).toHaveBeenCalledTimes(1)
  })

  it('keeps a server running a native chat with no terminals', async () => {
    const result = await relaunch({ ...IDLE, chatSessions: 1 })
    expect(result).toMatchObject({
      ready: true,
      deferredUpdate: { reason: expect.stringContaining('1 chat runs on it') }
    })
    expect(stopIncumbent).not.toHaveBeenCalled()
  })

  it('treats a server that cannot report its chats as running one', async () => {
    const { chatSessions: _, ...older } = IDLE
    for (const census of [older, { ...IDLE, chatSessions: null }]) {
      const result = await relaunch(census)
      expect(result).toMatchObject({
        ready: true,
        deferredUpdate: { reason: expect.stringContaining('could not tell whether a chat runs') }
      })
    }
    expect(stopIncumbent).not.toHaveBeenCalled()
  })

  it('keeps the server when a chat starts before the fenced recount', async () => {
    const result = await relaunch(IDLE, { ...IDLE, chatSessions: 2 })
    expect(result).toMatchObject({
      ready: true,
      deferredUpdate: { reason: expect.stringContaining('2 chats run on it') }
    })
    expect(stopIncumbent).not.toHaveBeenCalled()
    expect(wakeStoppedManagedOpenkodod).not.toHaveBeenCalled()
  })
})
