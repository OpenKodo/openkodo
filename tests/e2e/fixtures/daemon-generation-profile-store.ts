import path from 'node:path'
import { installOpenkododHostAdapters } from '../../../src/main/openkodod/host-runtime/openkodod-host-adapters'
import type { Store } from '../../../src/main/persistence/loading-store/store'
import { createProfileStateStore } from '../../../src/main/persistence/profile-state/startup/profile-state-store-factory'

export function createDaemonGenerationProfileStore(directory: string): Store {
  installOpenkododHostAdapters()
  // The bundled fixture has no profile writer worker; use the synchronous SQLite authority.
  return createProfileStateStore({
    dataFile: path.join(directory, 'openkodo-data.json'),
    databaseFile: path.join(directory, 'profile-state.sqlite'),
    profileId: 'legacy-close-fixture'
  }).store
}
