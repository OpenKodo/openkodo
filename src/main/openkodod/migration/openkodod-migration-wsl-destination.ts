// In-place WSL moves require the desktop-launched openkodod in the source distro to own the unchanged paths.
import type { OpenkododMigrationManifestSource } from '../../../shared/openkodod-migration/openkodod-migration-manifest'
import { isOpenkododMigrationLocalWslSource } from '../../../shared/openkodod-migration/openkodod-migration-source-kind'
import { isWslHostOpenkododProcess } from '../../wsl/filesystem/wsl-guest-windows-drive-path'
import { OPENKODOD_WSL_DISTRO_GUID_ENV } from '../../../shared/remote-runtime/serve-supervisor/openkodod-server-launch-env'

export const OPENKODOD_MIGRATION_SOURCE_NOT_THIS_HOST = 'openkodod_migration_source_not_this_host'

export function servesLocalWslMigrationSource(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): boolean {
  return isWslHostOpenkododProcess(env, platform)
}

// E2E hosts stand in for a WSL host's openkodod; a real one is identified by isWslHostOpenkododProcess.
export const OPENKODO_E2E_WSL_MOVE_DESTINATION_ENV = 'OPENKODO_E2E_WSL_MOVE_DESTINATION'

/**
 * Whether this host is a WSL move's destination: it installs moved panes' terminal history and
 * serves their stored scrollback. Every other host keeps that wire surface off.
 */
export function servesWslMovedPaneHistory(env: NodeJS.ProcessEnv = process.env): boolean {
  return isWslHostOpenkododProcess(env) || env[OPENKODO_E2E_WSL_MOVE_DESTINATION_ENV] === '1'
}

export function assertOpenkododMigrationSourceServedHere(
  source: OpenkododMigrationManifestSource,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): void {
  if (!isOpenkododMigrationLocalWslSource(source)) {
    return
  }
  // WSL distro names and their UNC forms are case-insensitive.
  const distro = env.WSL_DISTRO_NAME?.trim().toLowerCase()
  if (!servesLocalWslMigrationSource(env, platform) || distro !== source.distro.toLowerCase()) {
    throw new Error(OPENKODOD_MIGRATION_SOURCE_NOT_THIS_HOST)
  }
  // Re-registering a distro reuses its name, not its files; require its registry ID when supplied.
  const guid = env[OPENKODOD_WSL_DISTRO_GUID_ENV]?.trim().toLowerCase()
  if (source.distroGuid !== undefined && guid !== source.distroGuid.toLowerCase()) {
    throw new Error(OPENKODOD_MIGRATION_SOURCE_NOT_THIS_HOST)
  }
}
