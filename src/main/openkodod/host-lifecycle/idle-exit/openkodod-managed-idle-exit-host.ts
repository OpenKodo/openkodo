import { getAppEnvironment } from '../../../../shared/app-lifecycle/app-environment'
import type { RuntimeRpcClientActivity } from '../../../runtime/rpc/server/runtime-rpc'
import type { OpenkododIdleExitEvidence } from './openkodod-idle-exit-monitor'
import {
  activationFenceExists,
  createOpenkododIdleProbes,
  installOpenkododManagedIdleExit,
  resolveOpenkododManagedIdleExit,
  type OpenkododManagedIdleExitConfig,
  type OpenkododManagedIdleExitPorts
} from './openkodod-managed-idle-exit'
import type { OpenkododDaemonRetirement } from '../../daemon/openkodod-daemon-retirement'
import { recoverDaemonAfterCancelledIdleStop } from '../../daemon/openkodod-idle-stop-daemon-recovery'
import {
  consumeOpenkododIdleStopRecord,
  discardOpenkododIdleStopRecord,
  writeOpenkododIdleStopRecord
} from './openkodod-idle-stop-record'
import type { OpenkododShutdownTrigger } from '../openkodod-lifecycle'
import {
  idleStopMayReleaseWslHolder,
  requestOpenkododWslHolderRelease,
  withdrawOpenkododWslHolderRelease
} from '../../instance-lock/openkodod-wsl-holder-release'
import type { OpenkododIdleStopRecord } from '../../../../shared/remote-runtime/openkodod-lifecycle/openkodod-idle-exit'
import { getStructuredAgentSessionHost } from '../../../native-chat/agent-session-wire/host/structured-agent-session-registry'

let requestIdleShutdown: OpenkododShutdownTrigger | null = null

/** Signal handling binds later; the quiet period must outlast the startup gap. */
export function bindOpenkododIdleShutdown(request: OpenkododShutdownTrigger): void {
  requestIdleShutdown = request
}

type OpenkododIdleExitRuntimePorts = {
  rpc: { readClientActivity(): RuntimeRpcClientActivity; fenceForIdleStop(): void }
  agentStates: () => readonly { state: string }[]
  hasStagedMigration: () => boolean
  automationsBusy: () => boolean
  emulatorsBusy: () => Promise<boolean>
  /** Stop the monitor before recording signal-driven shutdown. */
  registerCleanup: (cleanup: () => void) => void
}

/** Under the startup lock, consume previous idle-stop evidence before this run can overwrite it. */
export function beginOpenkododIdleExit(userDataPath: string): {
  previousIdleStop: OpenkododIdleStopRecord | null | undefined
  start: (ports: OpenkododIdleExitRuntimePorts) => Promise<void>
} {
  withdrawOpenkododWslHolderRelease(userDataPath)
  const config = resolveOpenkododManagedIdleExit(process.env)
  if (!config) {
    return { previousIdleStop: undefined, start: async () => {} }
  }
  const previousIdleStop = consumeOpenkododIdleStopRecord(userDataPath)
  if (previousIdleStop) {
    console.error(`[openkodod] the previous run stopped idle at ${previousIdleStop.stoppedAt}`)
  }
  const version = getAppEnvironment().getVersion()
  return {
    previousIdleStop,
    start: (ports) => startOpenkododManagedIdleExit({ ...ports, config, userDataPath, version })
  }
}

async function startOpenkododManagedIdleExit(
  input: OpenkododIdleExitRuntimePorts & {
    config: OpenkododManagedIdleExitConfig
    userDataPath: string
    version: string
  }
): Promise<void> {
  const { getLocalPtyProvider } = await import('../../../ipc/pty/provider/registry')
  const { getCurrentDaemonPid, getDaemonEndpointFacts, isDaemonTerminalAdmissionClosed } =
    await import('../../../daemon/providers/lifecycle/daemon-provider-state')
  const { countLiveOpenkododDaemonSessions, retireOpenkododDaemonIfIdle } =
    await import('../../daemon/openkodod-daemon-retirement')
  const idleRecord = createIdleStopRecordOwnership(input.userDataPath)
  const hasChatProviders = (): boolean =>
    (getStructuredAgentSessionHost()?.chatSessionCount() ?? 0) > 0
  const ports: OpenkododManagedIdleExitPorts = {
    readClientActivity: () => input.rpc.readClientActivity(),
    listTerminals: () => getLocalPtyProvider().listProcesses(),
    countDaemonSessions: countLiveOpenkododDaemonSessions,
    hasDaemon: () => getDaemonEndpointFacts() !== null,
    agentStates: input.agentStates,
    hasChatProviders,
    hasStagedMigration: input.hasStagedMigration,
    automationsBusy: input.automationsBusy,
    emulatorsBusy: input.emulatorsBusy,
    activationFenceExists
  }
  // Client/terminal evidence is already checked; recheck other work exit would destroy.
  const nonTerminalWorkProbes = createOpenkododIdleProbes(input.config, ports).filter(
    (probe) => probe.name !== 'clients' && probe.name !== 'terminals'
  )
  const hasNonTerminalWork = async (): Promise<boolean> => {
    for (const probe of nonTerminalWorkProbes) {
      if (
        (await Promise.resolve()
          .then(probe.read)
          .catch(() => 'unverifiable')) !== 'idle'
      ) {
        return true
      }
    }
    return false
  }
  const dispose = installOpenkododManagedIdleExit({
    config: input.config,
    ports,
    stop: async (evidence) => {
      // Replacement must target only the daemon incarnation that agreed to retire.
      const retiringPid = getCurrentDaemonPid()
      const outcome = await stopForIdle(input, evidence, retireOpenkododDaemonIfIdle)
      // Clients/providers can return while the retirement reply is pending.
      const activity = input.rpc.readClientActivity()
      if (
        hasChatProviders() ||
        activity.openConnections > 0 ||
        activity.requestsInFlight > 0 ||
        activity.lastRequestAt > evidence.quietSince
      ) {
        discardOpenkododIdleStopRecord(input.userDataPath)
        const daemon = await recoverDaemonAfterCancelledIdleStop(outcome, {
          admissionClosed: isDaemonTerminalAdmissionClosed,
          retireAgain: () => retireOpenkododDaemonIfIdle(),
          replaceDaemon: async () => {
            if (retiringPid === null) {
              throw new Error('the retiring daemon never identified itself')
            }
            const { restartDaemon } =
              await import('../../../daemon/providers/lifecycle/daemon-provider-restart')
            await restartDaemon({ expectedDaemonPid: retiringPid, endpointMayBeGone: true })
          }
        })
        if (daemon === 'serving' || (await hasNonTerminalWork())) {
          return false
        }
        commitIdleStop(input.rpc, idleRecord)
        return true
      }
      if (idleStopMayReleaseWslHolder(process.env, outcome)) {
        try {
          requestOpenkododWslHolderRelease(input.userDataPath)
        } catch (error) {
          console.error('[openkodod] could not release the WSL distro holder:', error)
        }
      }
      // Same turn as the check above: no request can slip in between and be lost to the exit.
      commitIdleStop(input.rpc, idleRecord)
      return true
    }
  })
  input.registerCleanup(() => {
    dispose()
    idleRecord.onShutdown()
  })
}

/** Stop, then fence admission in the same turn (cleanup starts a microtask later), only when
 *  this idle stop owns the stop: a SIGTERM stop already under way is no idle stop. */
function commitIdleStop(
  rpc: OpenkododIdleExitRuntimePorts['rpc'],
  idleRecord: ReturnType<typeof createIdleStopRecordOwnership>
): void {
  if (idleRecord.requestShutdown(requestIdleShutdown)) {
    rpc.fenceForIdleStop()
  }
}

/** Discard failed, overdue and externally superseded idle stops, including cleanup before request completion. */
export function createIdleStopRecordOwnership(userDataPath: string): {
  requestShutdown(request: OpenkododShutdownTrigger | null): boolean
  onShutdown(): void
} {
  let idleOwnsStop = false
  // The holder release rides on the idle stop: a stop that is not idle must not end the distro.
  const discard = (): void => {
    discardOpenkododIdleStopRecord(userDataPath)
    withdrawOpenkododWslHolderRelease(userDataPath)
  }
  return {
    requestShutdown: (request) => {
      // Cleanup may run before the trigger returns, so establish ownership first.
      idleOwnsStop = true
      if (request?.('idle', discard) !== true) {
        idleOwnsStop = false
        discard()
      }
      return idleOwnsStop
    },
    onShutdown: () => {
      if (!idleOwnsStop) {
        discard()
      }
    }
  }
}

async function stopForIdle(
  input: { userDataPath: string; version: string },
  evidence: OpenkododIdleExitEvidence,
  retireDaemon: () => Promise<OpenkododDaemonRetirement>
): Promise<OpenkododDaemonRetirement> {
  console.error(`[openkodod] stopping: no client, terminal or job for ${evidence.timeoutMs}ms`)
  try {
    writeOpenkododIdleStopRecord(input.userDataPath, evidence, input.version)
  } catch (error) {
    console.error('[openkodod] could not record the idle stop:', error)
  }
  // Only the daemon’s atomic empty census can authorize retirement.
  const outcome = await retireDaemon().catch((error: unknown): OpenkododDaemonRetirement => ({
    retirement: 'unverifiable',
    liveSessions: null,
    reason: String(error)
  }))
  console.error(
    `[openkodod] terminal daemon on idle stop: ${outcome.retirement}${outcome.reason ? ` (${outcome.reason})` : ''}`
  )
  return outcome
}
