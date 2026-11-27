// Open forwards prove no identity; require an authenticated status call from the pinned server.
import { parsePairingCode } from '../../../shared/remote-runtime/pairing/pairing'
import {
  pairedRuntimeConnectionFromOffer,
  type PairedRuntimeConnection
} from '../../../shared/remote-runtime/pairing/paired-runtime-connection'
import { OPENKODOD_MANAGED_REMOTE_PORT } from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-managed-runtime'
import {
  isRecoverableRemoteRuntimeConnectionError,
  toRemoteRuntimeClientErrorLike
} from '../../../shared/remote-runtime/remote-runtime-client-error-classification'
import { RemoteRuntimeClientError } from '../../../shared/remote-runtime/remote-runtime-client-error'
import {
  getPreferredPairedRuntimeConnection,
  type KnownRuntimeEnvironment
} from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import { verifyRuntimePairingIdentity } from '../../runtime/hosts/identity/runtime-environment-identity-verification'
import type { ServeReadiness } from '../../server/serve-readiness'
import { openkododBoundPort } from './openkodod-managed-bound-port'
import { tunneledOpenkododPairingCode } from './openkodod-tunneled-pairing'
import { OpenkododManagedPairingRepairFailedError } from './openkodod-managed-pairing-repair-failure'
import { quotePosixShellUnlessPlain } from '../../../shared/shell/launch/shell-argument-quoting'
import { RUNTIME_SERVER_REPLACED_STATUS_CODE } from '../../../shared/remote-runtime/host-status/runtime-host-status'

/** Unreachable proves no identity; unpaired is a refusal sealed by the pinned server key. */
export type OpenkododTunnelIdentity =
  | { verdict: 'verified' }
  | { verdict: 'foreign' | 'unreachable' | 'unpaired'; detail: string }

export const OPENKODOD_IDENTITY_MISMATCH_CODE = 'openkodod_identity_mismatch'

/** `foreign-port`: another process answered; `replaced-server`: the host's own slot serves another key. */
export type OpenkododIdentityMismatchKind = 'foreign-port' | 'replaced-server'

export class OpenkododManagedIdentityError extends Error {
  readonly code = OPENKODOD_IDENTITY_MISMATCH_CODE
  private constructor(
    readonly kind: OpenkododIdentityMismatchKind,
    explanation: string,
    detail: string
  ) {
    super(`${OPENKODOD_IDENTITY_MISMATCH_CODE}: ${explanation}: ${detail}`)
    this.name = 'OpenkododManagedIdentityError'
  }

  static foreignPort(remotePort: number, detail: string): OpenkododManagedIdentityError {
    return new OpenkododManagedIdentityError(
      'foreign-port',
      `the server on remote port ${remotePort} is not this host’s OpenKodo server ` +
        '(another OpenKodo may be using that port)',
      detail
    )
  }

  /** SSH access alone can't re-pin a different server key, so only the user can re-pair. */
  static replacedServer(
    environment: { id: string; name: string },
    detail: string
  ): OpenkododManagedIdentityError {
    const environmentName = environment.name
    // Why the id: a name is free text, so pasting it into a shell could expand or pick another server.
    const selector = quotePosixShellUnlessPlain(environment.id)
    return new OpenkododManagedIdentityError(
      'replaced-server',
      `${environmentName} is not the OpenKodo server this desktop paired with (OpenKodo now connects ` +
        'to the host as a different SSH user, or the server was reinstalled), so reconnecting ' +
        `won’t restore access. To pair with the host’s current server, open the ⋯ menu on ` +
        `${environmentName} in Settings › Remote OpenKodo Servers and choose Forget… (or run ` +
        `\`openkodo environment forget --environment ${selector} --yes\`), then click ` +
        'Connect on the SSH host',
      detail
    )
  }
}

/** Status code of a refusal automatic retries can't clear (the pairing must change); null otherwise. */
export function managedOpenkododRefusalNeedingUserCode(error: unknown): string | null {
  if (error instanceof OpenkododManagedIdentityError && error.kind === 'replaced-server') {
    return RUNTIME_SERVER_REPLACED_STATUS_CODE
  }
  return error instanceof OpenkododManagedPairingRepairFailedError ? 'unauthorized' : null
}

export const OPENKODOD_PAIRING_REJECTED_CODE = 'openkodod_pairing_rejected'

export class OpenkododManagedPairingRejectedError extends Error {
  readonly code = OPENKODOD_PAIRING_REJECTED_CODE
  constructor(detail: string) {
    super(
      `${OPENKODOD_PAIRING_REJECTED_CODE}: this host’s OpenKodo server no longer accepts ` +
        `this desktop's pairing (its saved devices were reset, or this desktop was removed ` +
        `there), so reconnecting alone won't restore access: ${detail}`
    )
    this.name = 'OpenkododManagedPairingRejectedError'
  }
}

export function openkododIdentityRefusal(
  remotePort: number,
  identity: Exclude<OpenkododTunnelIdentity, { verdict: 'verified' }>
): Error {
  return identity.verdict === 'unpaired'
    ? new OpenkododManagedPairingRejectedError(identity.detail)
    : OpenkododManagedIdentityError.foreignPort(remotePort, identity.detail)
}

// Key rejection closes the socket instead of returning a status reply.
const FOREIGN_CLOSE_CODES = new Set([4001, 4003])

export function classifyOpenkododTunnelIdentityFailure(error: unknown): OpenkododTunnelIdentity {
  const detail = error instanceof Error ? error.message : String(error)
  // Only sealed access-grant refusals prove the pinned server answered.
  if (
    error instanceof RemoteRuntimeClientError &&
    error.code === 'unauthorized' &&
    error.pairingStage === 'access-grant'
  ) {
    return { verdict: 'unpaired', detail }
  }
  if (error instanceof RemoteRuntimeClientError && FOREIGN_CLOSE_CODES.has(error.closeCode ?? 0)) {
    return { verdict: 'foreign', detail }
  }
  return isRecoverableRemoteRuntimeConnectionError(toRemoteRuntimeClientErrorLike(error))
    ? { verdict: 'unreachable', detail }
    : { verdict: 'foreign', detail }
}

export async function verifyOpenkododPairingIdentity(
  connection: PairedRuntimeConnection,
  expected: Pick<KnownRuntimeEnvironment, 'runtimeId' | 'pairedDeviceId'>
): Promise<OpenkododTunnelIdentity> {
  try {
    await verifyRuntimePairingIdentity(connection, expected)
    return { verdict: 'verified' }
  } catch (error) {
    return classifyOpenkododTunnelIdentityFailure(error)
  }
}

export function verifyManagedOpenkododTunnelIdentity(
  environment: KnownRuntimeEnvironment
): Promise<OpenkododTunnelIdentity> {
  if (!environment.openkododDeployment) {
    return Promise.resolve({ verdict: 'verified' })
  }
  // Runtime/device IDs can change or become stale; pinned-key handshake and token acceptance prove identity.
  return verifyOpenkododPairingIdentity(getPreferredPairedRuntimeConnection(environment), {
    runtimeId: null
  })
}

/** Fresh deploys have no saved pairing; reread readiness after foreign answers to follow port changes. */
export function deployedOpenkododTunnelChecks(
  initial: ServeReadiness,
  rereadReadiness: () => Promise<ServeReadiness>
) {
  let readiness = initial
  return {
    readiness: () => readiness,
    remotePort: openkododBoundPort(initial) ?? OPENKODOD_MANAGED_REMOTE_PORT,
    rereadRemotePort: async () => {
      readiness = await rereadReadiness()
      return openkododBoundPort(readiness) ?? OPENKODOD_MANAGED_REMOTE_PORT
    },
    verify: async (localPort: number): Promise<OpenkododTunnelIdentity> => {
      const pairing = parsePairingCode(tunneledOpenkododPairingCode(readiness, localPort))
      return pairing
        ? verifyOpenkododPairingIdentity(pairedRuntimeConnectionFromOffer(pairing), {
            runtimeId: readiness.runtimeId || null
          })
        : {
            verdict: 'foreign',
            detail: 'This host’s OpenKodo server published an invalid pairing.'
          }
    }
  }
}
