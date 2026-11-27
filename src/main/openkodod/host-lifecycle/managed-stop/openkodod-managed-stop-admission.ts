import type { OpenkododManagedStopRequest } from '../../../../shared/remote-runtime/openkodod-lifecycle/openkodod-stop-request'
import { persistOpenkododDaemonRetirementRecord } from './openkodod-completed-stop-receipt'
import type { OpenkododDaemonRetirement } from '../../daemon/openkodod-daemon-retirement'
import { stopOpenkododAutomationScheduler } from '../../host-runtime/openkodod-automations'
import { holdOpenkododTerminalAdmissionUntilExit } from './openkodod-stop-terminal-admission'

// Keep daemon imports lazy so entry loading cannot initialize native code.
async function retireLazily(): Promise<OpenkododDaemonRetirement> {
  const { retireOpenkododDaemonIfIdle } = await import('../../daemon/openkodod-daemon-retirement')
  return retireOpenkododDaemonIfIdle()
}

/** Record managed-stop outcomes without vetoing the stop. */
export async function prepareOpenkododManagedStop(
  request: OpenkododManagedStopRequest,
  retire: () => Promise<OpenkododDaemonRetirement> = retireLazily,
  stopAutomations: () => void = stopOpenkododAutomationScheduler,
  holdTerminalAdmission: () => void = holdOpenkododTerminalAdmissionUntilExit
): Promise<void> {
  // Fence spawns before potentially slow daemon retirement.
  holdTerminalAdmission()
  // Stop dispatch before census so new runs cannot race shutdown.
  stopAutomations()
  if (!request.retireIdleDaemon) {
    return
  }
  const outcome = await retire().catch((error: unknown): OpenkododDaemonRetirement => ({
    retirement: 'unverifiable',
    liveSessions: null,
    reason: `Retirement failed: ${error instanceof Error ? error.message : String(error)}`
  }))
  try {
    persistOpenkododDaemonRetirementRecord(request, outcome)
  } catch (error) {
    // Missing retirement records remain unverifiable to the completion reader.
    console.error('[openkodod] could not record daemon retirement:', error)
  }
}
