import { createProfileStateStoreForStartup } from '../../persistence/profile-state/startup/profile-state-startup-authority'
import type { ProfileStateStoreFactoryResult } from '../../persistence/profile-state/startup/profile-state-store-factory'
import { ensureActiveOpenKodoProfile } from '../../openkodo-profiles/profile-index-store'
import { initializeTeamCapabilities } from '../../openkodo-profiles/cloud-auth/initialize-team-capabilities'
import { initOpenKodoProfilePaths } from '../../openkodo-profiles/profile-storage-paths'
import { initSshHostKeyStoreFile } from '../../ssh/host-keys/ssh-host-key-store'
import { initOpenkododHeldFenceTokenFile } from '../../managed-server/activation/openkodod-held-fence-tokens'
import { emitOpenkododProfileStateAuthoritySelected } from './openkodod-profile-state-telemetry'
import { isWslHostOpenkododProcess } from '../../wsl/filesystem/wsl-guest-windows-drive-path'
import { recordOpenkododServedProfile } from '../openkodod-served-profile'

/** WSL hosts are held to a per-distro memory budget; the idle writer thread costs ~13-15 MB. */
export const WSL_HOST_PROFILE_WRITER_IDLE_STOP_MS = 60_000

/** SSH hosts and the desktop keep their writer thread running. */
export function openkododProfileWriterIdleStopMs(
  isWslHost: () => boolean = isWslHostOpenkododProcess
): number | undefined {
  return isWslHost() ? WSL_HOST_PROFILE_WRITER_IDLE_STOP_MS : undefined
}

type OpenkododProfileStateStartup = {
  store: ProfileStateStoreFactoryResult['store']
  authority: {
    backend: ProfileStateStoreFactoryResult['backend']
    classification: ProfileStateStoreFactoryResult['classification']
    authority_mode: 'sqlite-established'
    runtime: 'openkodod'
    migrated: boolean
  }
}

export async function createOpenkododProfileStateStartup(
  userDataPath: string
): Promise<OpenkododProfileStateStartup> {
  initOpenKodoProfilePaths()
  const profile = ensureActiveOpenKodoProfile(userDataPath)
  await initializeTeamCapabilities(userDataPath, profile.profile)
  // Real persistence avoids falsely empty RPCs; headless authority keeps automations owned by this host.
  const result = await createProfileStateStoreForStartup({
    userDataPath,
    dataFile: profile.dataFile,
    databaseFile: profile.stateDatabaseFile,
    profileId: profile.profile.id,
    runtime: 'openkodod',
    storageAuthority: 'runtime',
    writerIdleStopMs: openkododProfileWriterIdleStopMs()
  })
  const authority = {
    backend: result.backend,
    classification: result.classification,
    authority_mode: 'sqlite-established' as const,
    runtime: 'openkodod' as const,
    migrated: result.migrated
  }
  try {
    initSshHostKeyStoreFile(profile.dataFile)
    initOpenkododHeldFenceTokenFile(profile.dataFile)
    emitOpenkododProfileStateAuthoritySelected(authority)
    recordOpenkododServedProfile(profile.profile.id)
    return { store: result.store, authority }
  } catch (error) {
    try {
      await result.store.freezeWritesAsync()
    } catch (closeError) {
      console.error(
        '[persistence] Failed to close profile persistence after startup failure:',
        closeError
      )
    }
    throw error
  }
}
