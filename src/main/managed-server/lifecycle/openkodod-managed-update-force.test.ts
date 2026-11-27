import { describe, expect, it } from 'vitest'
import type { OpenkododTerminalCensus } from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-terminal-census'
import { emptyOpenkododActivationRecord } from '../activation/openkodod-activation-record'
import { CURRENT_OPENKODOD_DAEMON_PROTOCOL } from '../activation/openkodod-daemon-protocol-crossing'
import { planOpenkododUpdate } from '../activation/openkodod-update-plan'
import { managedOpenkododUpdateForce } from './openkodod-managed-update-decision'

// What a released openkodod answers when its daemon never started: no session or in-process count.
const OLDER_SERVER_UNCOUNTED: OpenkododTerminalCensus = {
  liveSessions: null,
  startedSinceActivation: null,
  daemonProtocolVersion: null,
  answered: true
}

function planWith(force: ReturnType<typeof managedOpenkododUpdateForce>) {
  return planOpenkododUpdate({
    record: { ...emptyOpenkododActivationRecord(), active: 'v1' },
    candidateVersion: 'v2',
    census: OLDER_SERVER_UNCOUNTED,
    candidateDaemonProtocol: CURRENT_OPENKODOD_DAEMON_PROTOCOL,
    // The candidate proved no daemon alive: the only terminals left run inside openkodod.
    hostDaemonProtocols: [],
    force
  })
}

describe('managedOpenkododUpdateForce', () => {
  it('keeps a bare force (CLI --force) deferring over an uncounted census', () => {
    const force = managedOpenkododUpdateForce({ force: true })
    expect(force).toBe('live-terminals')
    expect(planWith(force)).toMatchObject({ action: 'defer', forceable: true })
  })

  it('lets a confirmed force (CLI --force --yes) pass once no daemon is alive', () => {
    const force = managedOpenkododUpdateForce({ force: true, endInProcessTerminals: true })
    expect(force).toBe(true)
    expect(planWith(force)).toMatchObject({ action: 'proceed', preservesLiveDaemon: false })
  })

  it('ignores the confirmation without force', () => {
    expect(managedOpenkododUpdateForce({ force: false, endInProcessTerminals: true })).toBe(false)
    expect(managedOpenkododUpdateForce({ endInProcessTerminals: true })).toBeUndefined()
  })

  it('keeps the desktop Update anyway levels', () => {
    expect(
      managedOpenkododUpdateForce({
        force: true,
        pastLiveTerminals: { incumbentVersion: 'v1', uncounted: true }
      })
    ).toBe(true)
    expect(managedOpenkododUpdateForce({ pastLiveTerminals: { incumbentVersion: 'v1' } })).toBe(
      'live-terminals'
    )
  })
})
