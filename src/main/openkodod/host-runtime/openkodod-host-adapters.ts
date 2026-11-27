import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { OPENKODOD_CLI_PACKAGE_FILENAME } from '../../../shared/remote-runtime/openkodod-distribution/openkodod-artifacts'
import {
  setAppEnvironment,
  type AppEnvironment
} from '../../../shared/app-lifecycle/app-environment'
import { createNodeServiceEnvironment } from '../../backend/node-service-environment'
import { setSecretStore } from '../../../shared/secure-storage/secret-store'
import { resolveOpenkododInstallRoot, resolveOpenkododPath } from './openkodod-app-paths'
import { getOpenkododCliLauncherPath } from '../serve-startup/openkodod-cli-launcher'
import {
  createOpenkododSecretStore,
  type OpenkododSecretStore
} from '../credentials/openkodod-secret-store'
import { setSpeechServiceFactories } from '../../speech/speech-runtime-service'
import { openkododSpeechServiceFactories } from './openkodod-speech-services'

let quitRegisteredHandlers = (): void => {}

export function runOpenkododQuitHandlers(): void {
  quitRegisteredHandlers()
}

function createNodeAppEnvironment(): AppEnvironment {
  const host = createNodeServiceEnvironment({
    getPath: resolveOpenkododPath,
    getAppPath: () => resolveOpenkododInstallRoot(),
    getVersion: () => process.env.OPENKODO_VERSION ?? '0.0.0-openkodod',
    isPackaged: () => true,
    getCliLauncherPath: getOpenkododCliLauncherPath
  })
  quitRegisteredHandlers = host.runQuitHandlers
  return host.environment
}

let openkododSecretStore: OpenkododSecretStore | null = null

export async function prepareOpenkododSecretStore(
  keyDir: string,
  userDataPath: string
): Promise<boolean> {
  if (!openkododSecretStore) {
    throw new Error(
      'openkodod_secret_store_not_installed — call installOpenkododHostAdapters() first'
    )
  }
  return openkododSecretStore.prepare({ keyDir, userDataPath })
}

/** Stamp the bundle’s own release so inherited desktop versions cannot misidentify this server. */
export function stampOpenkododAppVersion(
  installRoot: () => string = resolveOpenkododInstallRoot
): void {
  let version: unknown
  try {
    const path = join(installRoot(), ...OPENKODOD_CLI_PACKAGE_FILENAME.split('/'))
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    version = parsed && typeof parsed === 'object' && 'version' in parsed ? parsed.version : null
  } catch {
    return
  }
  if (typeof version === 'string' && version.length > 0) {
    process.env.OPENKODO_APP_VERSION = version
  }
}

export function installOpenkododHostAdapters(): void {
  stampOpenkododAppVersion()
  setAppEnvironment(createNodeAppEnvironment())
  openkododSecretStore = createOpenkododSecretStore()
  setSecretStore(openkododSecretStore)
  setSpeechServiceFactories(openkododSpeechServiceFactories)
}
