/** Before Add persists its record, removal/disable/startup cannot find the connection or detached holder. Every unsuccessful Add must release both here. */
import { errorMessage } from '../../../shared/errors/error-message'
import type { WslHostAddResult } from '../../../shared/remote-runtime/wsl-hosts/wsl-host-types'
import { OpenkododHostUnsupportedError } from '../../openkodod/diagnostics/openkodod-host-unavailable'
import type { WslHostConnector } from './wsl-host-connector-contract'
import { WslOpenkododLaunchDeferredError } from '../openkodod/wsl-openkodod-connection-errors'
import {
  WslDistroNotRegisteredError,
  WslDistroVersion1Error,
  wslUnsupportedDistroFixMessage
} from '../discovery/wsl-distro-unsupported'
import { wslHostAddRefusal } from './wsl-host-add-admission'
import { RemoteNodeRuntimeSelfTestError } from '../../managed-server/install/openkodod-remote-node-runtime-report'
import type { WslOpenkododConnection } from '../openkodod/wsl-openkodod-connection-types'

type WslHostAddRefusal = Extract<WslHostAddResult, { ok: false }>
type AddConnector = Pick<WslHostConnector, 'connect' | 'disconnect' | 'releaseHolder'>

export async function abandonWslHostAdd(connector: AddConnector, distro: string): Promise<void> {
  await connector.disconnect(distro).catch(() => {})
  await connector.releaseHolder(distro).catch(() => {})
}

/** `lateRefusal` is re-read once the connect lands: the setting can change while it runs. */
export async function connectForWslHostAdd(
  connector: AddConnector,
  distro: string,
  lateRefusal: () => WslHostAddRefusal | null
): Promise<{ connection: WslOpenkododConnection } | WslHostAddRefusal> {
  let connection: WslOpenkododConnection
  try {
    connection = await connector.connect(distro)
  } catch (error) {
    await abandonWslHostAdd(connector, distro)
    if (error instanceof WslOpenkododLaunchDeferredError) {
      return { ok: false, kind: 'deferred', message: error.launch.reason }
    }
    if (error instanceof WslDistroVersion1Error) {
      return wslHostAddRefusal('unsupported-wsl1', 'wsl1', { distro: error.distro })
    }
    if (error instanceof WslDistroNotRegisteredError) {
      return wslHostAddRefusal('unsupported-distro', 'notRegistered', { distro: error.distro })
    }
    return {
      ok: false,
      kind: connectFailureKind(error),
      message: wslUnsupportedDistroFixMessage(error) ?? errorMessage(error)
    }
  }
  const refusal = lateRefusal()
  if (refusal) {
    await abandonWslHostAdd(connector, distro)
    return refusal
  }
  return { connection }
}

/** A distro OpenKodo can't run in reads apart from a connect that may work on retry. */
function connectFailureKind(error: unknown): WslHostAddRefusal['kind'] {
  return error instanceof OpenkododHostUnsupportedError ||
    error instanceof RemoteNodeRuntimeSelfTestError
    ? 'unsupported-distro'
    : 'failed'
}
