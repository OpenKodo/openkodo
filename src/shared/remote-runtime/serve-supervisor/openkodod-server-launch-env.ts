import { OPENKODOD_IDLE_TIMEOUT_ENV } from '../openkodod-lifecycle/openkodod-idle-exit'
import { OPENKODOD_MANAGED_ACTIVATION_ROOT_ENV } from './openkodod-managed-launch-env'

/** WSL-host launch marker; SSH guests and WSLg retain their original PATH. */
export const OPENKODOD_WSL_HOST_ENV = 'OPENKODO_WSL_OPENKODOD_HOST'

/** Desktop-provided registry ID; guests cannot read it themselves. */
export const OPENKODOD_WSL_DISTRO_GUID_ENV = 'OPENKODO_WSL_DISTRO_GUID'

/** The AppImage file `openkodo serve` runs from: openkodod's slot has no Electron, so its browser helper launches this. */
export const OPENKODO_SERVE_APPIMAGE_ENV = 'OPENKODO_SERVE_APPIMAGE'

/**
 * What a client puts in a server's launch env. A user's own `openkodod` started from one of the
 * server's shells is not that server, so every pane scrubs these.
 */
export const OPENKODOD_SERVER_LAUNCH_ENV_KEYS = [
  // Not client-managed.
  OPENKODOD_MANAGED_ACTIVATION_ROOT_ENV,
  // Keeps the default idle window.
  OPENKODOD_IDLE_TIMEOUT_ENV,
  // Not a WSL host: no migration capabilities, no /mnt/c refusal, no account-push wait.
  OPENKODOD_WSL_HOST_ENV,
  OPENKODOD_WSL_DISTRO_GUID_ENV,
  // A user's own openkodod must look up its own installed app.
  OPENKODO_SERVE_APPIMAGE_ENV
] as const
