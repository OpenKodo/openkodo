import type { SshTarget } from '../../../shared/remote-runtime/ssh/ssh-types'
import type { WslOpenkododHostTarget } from '../../wsl/openkodod/wsl-openkodod-host-target'
import type { RemoteInstallTransport } from './remote-install-transport'
import type { OpenkododLaunchDetach } from './openkodod-remote-launch'

/** Only id/label have the same meaning across host kinds. */
export type OpenkododHostTarget = SshTarget | WslOpenkododHostTarget

export function isWslOpenkododHostTarget(
  target: OpenkododHostTarget
): target is WslOpenkododHostTarget {
  return 'kind' in target && target.kind === 'wsl'
}

export type OpenkododHostTransport = RemoteInstallTransport & {
  getTarget(): OpenkododHostTarget
  /** Absent on SSH, which detaches with nohup. */
  readonly openkododLaunchDetach?: OpenkododLaunchDetach
  /** Pass client-only host facts at launch; SSH adds none. */
  readonly openkododLaunchEnv?: (
    launch: OpenkododLaunchEnvRequest
  ) => Promise<readonly OpenkododLaunchEnvEntry[]>
  /** WSL only: a transport whose every host command first runs the POSIX `fence` statement. */
  readonly withCommandFence?: (fence: string) => OpenkododHostTransport
}

/** The slot being launched; entries only its own build understands must check the version. */
export type OpenkododLaunchEnvRequest = { readonly fullVersion: string }

/** `keep-existing` applies the value only when the launching shell has none, so a user's own setting wins. */
export type OpenkododLaunchEnvEntry = readonly [name: string, value: string, mode?: 'keep-existing']
