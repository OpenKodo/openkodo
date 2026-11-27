import { getAppEnvironment, hasAppEnvironment } from '../app-lifecycle/app-environment'

export function getOpenKodoCliCommandNameForPlatform(platform: NodeJS.Platform): string {
  if (platform === 'linux') {
    return 'openkodo-ide'
  }
  if (platform === 'win32') {
    return 'openkodo.cmd'
  }
  return 'openkodo'
}

/** The GNOME-conflict `openkodo-ide` rename is desktop-only: SSH relays and headless OpenKodo servers put plain `openkodo` on PATH. */
export function skipsLinuxOpenKodoCliRename(isRemote: boolean | undefined): boolean {
  if (isRemote) {
    return true
  }
  // Only a headless server publishes its own launcher; Windows ones (WSL launches) keep the rename.
  const launcher = hasAppEnvironment() ? getAppEnvironment().getCliLauncherPath?.() : null
  return launcher?.endsWith('/openkodo') ?? false
}
