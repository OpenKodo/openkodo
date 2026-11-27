import { encodePairingOffer } from '../../../shared/remote-runtime/pairing/pairing'
import {
  getPreferredPairingOffer,
  type KnownRuntimeEnvironment
} from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import { disconnectRegisteredSshTarget } from '../../ipc/ssh/ssh-session-teardown'
import type { OpenkododMigrationDestinationCatalog } from '../migration/cutover/openkodod-migration-cutover-coordinator'
import {
  abortRemoteOpenkododMigrationCatalog,
  commitRemoteOpenkododMigrationCatalog,
  readRemoteOpenkododMigrationCatalogState,
  stageRemoteOpenkododMigrationCatalog
} from '../migration/catalog/openkodod-migration-catalog-client'
import {
  listRemoteOpenkododRepositories,
  type OpenkododServerRepository
} from '../migration/linking/openkodod-server-repositories'
import {
  stageRemoteOpenkododMigrationBlobChunk,
  stageRemoteOpenkododMigrationSnapshotChunk
} from '../migration/transfers/openkodod-migration-chunk-client'
import { readRemoteOpenkododMigrationCapabilities } from '../migration/catalog/openkodod-migration-capabilities-client'
import { abortRemoteOpenkododMigrationCatalogByReference } from '../migration/catalog/openkodod-migration-catalog-reference-client'
import {
  enableRemoteOpenkododAutomation,
  type EnableServerAutomation
} from '../../persistence/migrating-openkodod-catalog/retained-source/openkodod-migration-moved-automations'
import { censusHostRelayTerminalsFor } from '../../ssh/legacy-relay/endpoints/ssh-host-relay-census-for-target'
import { isBridgeableLease } from '../../ssh/legacy-relay/bridge/legacy-relay-bridge-leases'
import type { OpenkododManagedConversionArgs } from './openkodod-runtime-conversion'

import {
  listRemoteOpenkododFolderCatalog,
  type OpenkododServerFolderCatalog
} from '../migration/linking/openkodod-server-folder-workspaces'

export function openkododMigrationDestinationFor(
  environment: KnownRuntimeEnvironment
): OpenkododMigrationDestinationCatalog {
  const pairingCode = encodePairingOffer(getPreferredPairingOffer(environment))
  const options = environment.runtimeId ? { expectedRuntimeId: environment.runtimeId } : {}
  return {
    readState: (manifest) =>
      readRemoteOpenkododMigrationCatalogState(pairingCode, manifest, options),
    stage: (manifest) => stageRemoteOpenkododMigrationCatalog(pairingCode, manifest, options),
    commit: (manifest) => commitRemoteOpenkododMigrationCatalog(pairingCode, manifest, options),
    abort: (manifest) => abortRemoteOpenkododMigrationCatalog(pairingCode, manifest, options),
    abortByReference: (manifest) =>
      abortRemoteOpenkododMigrationCatalogByReference(pairingCode, manifest, options),
    stageChunk: (request) =>
      stageRemoteOpenkododMigrationSnapshotChunk(pairingCode, request, options),
    readCapabilities: () => readRemoteOpenkododMigrationCapabilities(pairingCode, options),
    stageBlobChunk: (request) =>
      stageRemoteOpenkododMigrationBlobChunk(pairingCode, request, options)
  }
}

export function openkododServerRepositoriesFor(
  environment: KnownRuntimeEnvironment
): Promise<OpenkododServerRepository[]> {
  const pairingCode = encodePairingOffer(getPreferredPairingOffer(environment))
  return listRemoteOpenkododRepositories(
    pairingCode,
    environment.runtimeId ? { expectedRuntimeId: environment.runtimeId } : {}
  )
}

export function openkododServerFolderCatalogFor(
  environment: KnownRuntimeEnvironment
): Promise<OpenkododServerFolderCatalog> {
  const pairingCode = encodePairingOffer(getPreferredPairingOffer(environment))
  return listRemoteOpenkododFolderCatalog(
    pairingCode,
    environment.runtimeId ? { expectedRuntimeId: environment.runtimeId } : {}
  )
}

export function openkododServerAutomationEnablerFor(
  environment: KnownRuntimeEnvironment
): EnableServerAutomation {
  const pairingCode = encodePairingOffer(getPreferredPairingOffer(environment))
  const options = environment.runtimeId ? { expectedRuntimeId: environment.runtimeId } : {}
  return (automation) => enableRemoteOpenkododAutomation(pairingCode, automation, options)
}

export function conversionCollaborators(): Pick<
  OpenkododManagedConversionArgs,
  | 'destinationFor'
  | 'serverRepositoriesFor'
  | 'serverFolderCatalogFor'
  | 'serverAutomationEnablerFor'
  | 'censusHost'
  | 'isBridgedPaneLease'
  | 'releaseDirectSession'
> {
  return {
    destinationFor: openkododMigrationDestinationFor,
    serverRepositoriesFor: openkododServerRepositoriesFor,
    serverFolderCatalogFor: openkododServerFolderCatalogFor,
    serverAutomationEnablerFor: openkododServerAutomationEnablerFor,
    censusHost: (target) => censusHostRelayTerminalsFor(target)(),
    isBridgedPaneLease: isBridgeableLease,
    releaseDirectSession: disconnectRegisteredSshTarget
  }
}
