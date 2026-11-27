import process from 'node:process'
import { startBackendCore } from '../../backend/core-runtime'
import { resolveUserDataPath } from './openkodod-app-paths'
import { prepareOpenkododCliLauncher } from '../serve-startup/openkodod-cli-launcher'
import { installOpenkododHostAdapters, runOpenkododQuitHandlers } from './openkodod-host-adapters'
import { prepareOpenkododSecretStoreAndMigrate } from '../credentials/openkodod-secret-store-startup'
import type { OpenkododHandle, OpenkododOptions } from '../serve-startup/openkodod-start-contract'
import { stampRuntimeSourceEnv } from '../../../shared/remote-runtime/host-catalog/runtime-source-env'
import { OPENKODO_SERVE_SUPERVISED_ENV } from '../../../shared/remote-runtime/serve-supervisor/serve-supervised-terminal-durability'

/** Resolve after transport readiness publishes the desktop-compatible serve payload. */
export async function startOpenkodod(options: OpenkododOptions = {}): Promise<OpenkododHandle> {
  installOpenkododHostAdapters()
  // Inherited terminal identity must not fence openkodod’s CLI children to the launching desktop.
  stampRuntimeSourceEnv(process.env, null)
  const userDataPath = resolveUserDataPath()
  // Override inherited data roots so CLI-shared Codex homes resolve on this host.
  process.env.OPENKODO_USER_DATA_PATH = userDataPath
  return startBackendCore({
    userDataPath,
    supervised: process.env[OPENKODO_SERVE_SUPERVISED_ENV] === '1',
    options,
    prepareCliLauncher: prepareOpenkododCliLauncher,
    prepareSecrets: prepareOpenkododSecretStoreAndMigrate,
    runQuitHandlers: runOpenkododQuitHandlers
  })
}
