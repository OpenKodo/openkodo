/** Unknown failures, including older hosts without census support, stay unverifiable and never mean zero live terminals. */
import { OPENKODOD_TERMINAL_CENSUS_RUNTIME_CAPABILITY } from '../../../shared/remote-runtime/protocol/openkodod-runtime-capabilities'
import { ELECTRON_REMOTE_RUNTIME_CLIENT_CAPABILITIES } from '../../../shared/remote-runtime/protocol/electron-remote-runtime-client-capabilities'
import type { PairedRuntimeConnection } from '../../../shared/remote-runtime/pairing/paired-runtime-connection'
import {
  getPreferredPairedRuntimeConnection,
  type KnownRuntimeEnvironment
} from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import {
  OPENKODOD_TERMINAL_CENSUS_METHOD,
  OpenkododTerminalCensusSchema,
  type OpenkododTerminalCensus,
  UNVERIFIABLE_OPENKODOD_TERMINAL_CENSUS
} from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-terminal-census'
import { sendRemoteRuntimeRequestOnSocket } from '../../../shared/remote-runtime/requests/remote-runtime-request-socket'
import type { OpenkododActivationRecord } from '../activation/openkodod-activation-record'
import { ensureOpenkododManagedTunnel } from './openkodod-managed-tunnel'
import { verifyOpenkododManagedServing } from './openkodod-managed-serving-verify'

export type OpenkododTerminalCensusRequestOptions = {
  releaseFinishedAutomationTerminals?: boolean
  /** Close the server's terminal admission this long before counting; 0 reopens it. */
  closeAdmissionForMs?: number
}

/** Wake idle servers behind ensured tunnels; failed wake/tunnel stays unverifiable. */
export async function collectManagedTerminalCensus(
  userDataPath: string,
  environment: KnownRuntimeEnvironment,
  record: OpenkododActivationRecord,
  timeoutMs = 15_000,
  options: OpenkododTerminalCensusRequestOptions = {}
): Promise<OpenkododTerminalCensus> {
  if (!record.active) {
    return { liveSessions: 0, startedSinceActivation: 0, daemonProtocolVersion: null }
  }
  const activatedAt = record.activatedAt ? Date.parse(record.activatedAt) : Number.NaN
  if (!Number.isFinite(activatedAt) || activatedAt < 0) {
    return UNVERIFIABLE_OPENKODOD_TERMINAL_CENSUS
  }
  try {
    // Use the tunnel's returned pairing; re-pairing may have retired the caller's token.
    const current = await ensureOpenkododManagedTunnel(userDataPath, environment.id)
    // Wake before census, except for reopen: a stopped server has no admission to release.
    if (options.closeAdmissionForMs !== 0) {
      await verifyOpenkododManagedServing(userDataPath, environment.id)
    }
    return await requestOpenkododTerminalCensus(
      getPreferredPairedRuntimeConnection(current),
      activatedAt,
      timeoutMs,
      options
    )
  } catch {
    return UNVERIFIABLE_OPENKODOD_TERMINAL_CENSUS
  }
}

export async function requestOpenkododTerminalCensus(
  connection: PairedRuntimeConnection,
  activatedAt: number,
  timeoutMs = 15_000,
  options: OpenkododTerminalCensusRequestOptions = {}
): Promise<OpenkododTerminalCensus> {
  try {
    const response = await sendRemoteRuntimeRequestOnSocket<unknown>(
      connection,
      OPENKODOD_TERMINAL_CENSUS_METHOD,
      {
        activatedAt,
        ...(options.releaseFinishedAutomationTerminals
          ? { releaseFinishedAutomationTerminals: true }
          : {}),
        // Older servers safely omit both unsupported admission request and reply fields.
        ...(options.closeAdmissionForMs === undefined
          ? {}
          : { closeAdmissionForMs: options.closeAdmissionForMs })
      },
      timeoutMs,
      undefined,
      (status) => {
        if (
          !status.ok ||
          !status.result.capabilities?.includes(OPENKODOD_TERMINAL_CENSUS_RUNTIME_CAPABILITY)
        ) {
          throw new Error('This host’s OpenKodo server does not report a terminal census.')
        }
      },
      undefined,
      ELECTRON_REMOTE_RUNTIME_CLIENT_CAPABILITIES,
      undefined,
      undefined
    )
    return response.ok
      ? { ...OpenkododTerminalCensusSchema.parse(response.result), answered: true }
      : UNVERIFIABLE_OPENKODOD_TERMINAL_CENSUS
  } catch {
    return UNVERIFIABLE_OPENKODOD_TERMINAL_CENSUS
  }
}
