import type {
  OpenKodoHooks,
  RepoHookSettings,
  SetupRunPolicy
} from '../../workspace-setup/openkodo-yaml-hook-types'
import type { SetupConfig } from '../../workspace-setup/hooks/openkodo-hook-setup-config'
export type GroupHookCheckResult = {
  status?: 'ok' | 'error'
  hasHooks: boolean
  hooks: OpenKodoHooks | null
  mayNeedUpdate: boolean
  unavailable?: 'wsl-distro-stopped' | 'wsl-distro-unverifiable'
  hookSettings?: RepoHookSettings
  setupRunPolicy: SetupRunPolicy
  setupConfig: SetupConfig | null
}
