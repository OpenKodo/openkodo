import { getAppEnvironment } from '../../../shared/app-lifecycle/app-environment'
import {
  getManagedOpenkododFenceEnvironmentId,
  managedOpenkododServerName
} from '../../../shared/remote-runtime/ssh/managed-openkodod-ssh-owner'
import { listEnvironments } from '../../../shared/remote-runtime/host-store/runtime-environment-store'
import { findOpenkododMigrationSourceCutoverForTarget } from '../../persistence/migrating-openkodod-catalog/cutover-journals/openkodod-migration-cutover-journal'
import { abandonOpenkododConversion } from '../../managed-server/migration/cutover/openkodod-conversion-abandon'
import { retainOpenkododMigrationSource } from '../../persistence/migrating-openkodod-catalog/retained-source/openkodod-migration-source-retention'
import { enableMovedOpenkododAutomationsForTarget } from '../../persistence/migrating-openkodod-catalog/retained-source/openkodod-migration-moved-automations'
import { hasOpenkododTemplate } from '../../openkodod/artifact-slots/openkodod-artifact-materializer'
import { isOpenkododHostUnavailableFixableOnHost } from '../../openkodod/diagnostics/openkodod-host-unavailable'
import { managedServerUpdateDeps } from '../../ssh/host-server/managed-server-update-deps'
import { ensureOpenkododManagedTunnel } from '../../managed-server/lifecycle/openkodod-managed-tunnel'
import { verifyOpenkododManagedServing } from '../../managed-server/lifecycle/openkodod-managed-serving-verify'
import { convertSshTargetToManagedOpenkodod } from '../../managed-server/lifecycle/openkodod-runtime-conversion'
import {
  openkododMigrationDestinationFor,
  openkododServerAutomationEnablerFor,
  openkododServerFolderCatalogFor,
  openkododServerRepositoriesFor
} from '../../managed-server/lifecycle/openkodod-runtime-conversion-wiring'
import { createManagedOpenkododEnvironment } from '../../managed-server/lifecycle/openkodod-runtime-deployment'
import type { HostServerOnConnectDeps } from '../../ssh/host-server/ssh-host-server-on-connect'
import {
  censusSshHostRelaysBeforeSession,
  relayTerminalsOnConnect
} from '../../ssh/legacy-relay/endpoints/ssh-host-relay-terminals-on-connect'
import { requireManagedOpenkododInfrastructure } from '../../managed-server/lifecycle/openkodod-managed-runtime-context'
import { censusHostRelayTerminalsFor } from '../../ssh/legacy-relay/endpoints/ssh-host-relay-census-for-target'
import { setSshHostServerStatus } from '../../ssh/host-server/ssh-host-server-status'
import { trackSshHostServerEvent } from '../../ssh/host-server/ssh-host-server-telemetry'
import { knownSshHostPlatform } from '../../ssh/remote-host/ssh-host-platform-memo'
import { knownOpenkododTunnelTransport } from '../../managed-server/lifecycle/openkodod-tunnel-transport-memo'
import { getSshTargetRegistryStore } from '../../ssh/targets/ssh-target-registry'
import { releaseUnreachableOpenkododSetup } from '../../managed-server/migration/cutover/openkodod-unreachable-setup-release'
import { broadcastSshState } from './ssh-renderer-broadcast'
import { connectInFlight } from './ssh-connect-attempt-registry'
import { startLegacyRelayBridge } from '../../ssh/legacy-relay/bridge/legacy-relay-bridge-registry'
import { isBridgeableLease } from '../../ssh/legacy-relay/bridge/legacy-relay-bridge-leases'

export function hostServerOnConnectDeps(userDataPath: string): HostServerOnConnectDeps {
  const registry = getSshTargetRegistryStore()!
  const claims = registry.getOpenkododRuntimeClaims()
  const store = registry.getOpenkododMigrationSource()
  const appVersion = getAppEnvironment().getVersion()
  const isRegistered = async (environmentId: string): Promise<boolean> =>
    (await listEnvironments(userDataPath)).some((entry) => entry.id === environmentId)
  return {
    // A fence alone may be unfinished setup; only registered servers count.
    managedEnvironmentId: async (target) => {
      const environmentId = getManagedOpenkododFenceEnvironmentId(target)
      return environmentId && (await isRegistered(environmentId)) ? environmentId : null
    },
    ensureTunnel: async (environmentId) => {
      await ensureOpenkododManagedTunnel(userDataPath, environmentId)
    },
    ensureServing: (environmentId) => verifyOpenkododManagedServing(userDataPath, environmentId),
    retainCommittedSource: async (target) => {
      const head = findOpenkododMigrationSourceCutoverForTarget(userDataPath, target.id)
      if (head?.phase !== 'destination-committed') {
        return 0
      }
      await retainOpenkododMigrationSource(userDataPath, head.migrationId, store)
      // Retry what earlier connects could not reach the server to re-enable.
      const environment = (await listEnvironments(userDataPath)).find(
        (entry) => entry.id === head.destinationEnvironmentId
      )
      return environment
        ? enableMovedOpenkododAutomationsForTarget(
            userDataPath,
            target.id,
            openkododServerAutomationEnablerFor(environment)
          )
        : 0
    },
    hasTemplate: hasOpenkododTemplate,
    recordedUnavailable: (target) =>
      target.managedServerUnavailable?.appVersion === appVersion
        ? target.managedServerUnavailable.reason
        : null,
    recordUnavailable: (target, reason) => {
      if (!isOpenkododHostUnavailableFixableOnHost(reason)) {
        registry.updateTarget(target.id, { managedServerUnavailable: { reason, appVersion } })
      }
    },
    ...managedServerUpdateDeps(userDataPath),
    isEmptyHost: (target) => {
      // An interrupted empty-host deploy passes its own claim, recorded by its provisioning intent.
      const environmentId = getManagedOpenkododFenceEnvironmentId(target)
      return claims.preflight(
        target.id,
        environmentId
          ? { environmentId, recorded: target.openkododProvisioning !== undefined }
          : undefined
      ).claimable
    },
    relayTerminals: (target) =>
      relayTerminalsOnConnect({
        store,
        targetId: target.id,
        censusHost: async () =>
          censusSshHostRelaysBeforeSession(
            await requireManagedOpenkododInfrastructure().connectionManager.connect(target),
            target.id
          )
      }),
    deploy: (target) =>
      createManagedOpenkododEnvironment(userDataPath, {
        name: target.openkododProvisioning?.name ?? managedOpenkododServerName(target),
        sshTargetId: target.id
      }),
    convert: async (target, hostProof) => {
      // COMPAT(legacy-relay-bridge): find the panes old relays still run before the tabs remount.
      if (hostProof?.bridged) {
        await startLegacyRelayBridge(target.id)
      }
      const converted = await convertSshTargetToManagedOpenkodod(userDataPath, {
        sshTargetId: target.id,
        name: managedOpenkododServerName(target),
        // The connect's own census already answered; a conversion before any session reuses it.
        censusHost: (host) =>
          hostProof ? Promise.resolve(hostProof) : censusHostRelayTerminalsFor(host)(),
        isBridgedPaneLease: isBridgeableLease,
        // Releasing the direct session here would cancel the connect that requested conversion.
        destinationFor: openkododMigrationDestinationFor,
        serverRepositoriesFor: openkododServerRepositoriesFor,
        serverFolderCatalogFor: openkododServerFolderCatalogFor,
        serverAutomationEnablerFor: openkododServerAutomationEnablerFor
      })
      // A quiet retry's refusal is not the user's attempt, so it keeps their consent.
      const quiet = connectInFlight.get(target.id)?.quiet?.active === true
      if (converted.outcome === 'converted' || (converted.outcome === 'refused' && !quiet)) {
        // Move-anyway consent covers one attempt; retain it on failure so held-fence verification can resume.
        registry.updateTarget(target.id, { managedServerLeaveBehind: undefined })
      }
      return converted
    },
    abandonDeploy: async (target) => {
      const environmentId =
        getManagedOpenkododFenceEnvironmentId(target) ??
        getManagedOpenkododFenceEnvironmentId(registry.getTarget(target.id))
      if (environmentId && !(await isRegistered(environmentId))) {
        claims.release(target.id, environmentId)
        await claims.flush()
      }
    },
    hasUnfinishedConversion: (target) => {
      const head = findOpenkododMigrationSourceCutoverForTarget(userDataPath, target.id)
      return (
        head !== null &&
        !head.supersedesMigrationId &&
        (head.phase === 'source-fenced' || head.phase === 'destination-staged')
      )
    },
    abandonConversion: async (target) => {
      await abandonOpenkododConversion({
        userDataPath,
        store,
        claims,
        targetId: target.id,
        destinationFor: openkododMigrationDestinationFor
      })
    },
    isFencedBeforeStaging: (target) =>
      findOpenkododMigrationSourceCutoverForTarget(userDataPath, target.id)?.phase ===
      'source-fenced',
    releaseUnreachableSetup: (target) =>
      releaseUnreachableOpenkododSetup({ userDataPath, claims, targetId: target.id }),
    // Read at report time: a deploy or conversion learns the platform while the decision runs.
    report: (target, event) =>
      trackSshHostServerEvent(
        event,
        knownSshHostPlatform(target.id),
        knownOpenkododTunnelTransport(target.id)
      ),
    progress: (target, phase) => {
      // Cancelled decisions keep running; their progress must not revive connection status.
      const attempt = connectInFlight.get(target.id)
      if (!attempt || attempt.quiet?.active) {
        return
      }
      setSshHostServerStatus(target.id, { kind: 'setting-up', phase })
      broadcastSshState(target.id, {
        targetId: target.id,
        status: 'connecting',
        error: null,
        reconnectAttempt: 0
      })
    }
  }
}
