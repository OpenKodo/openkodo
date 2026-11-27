import { sshExecutionHostStorageIdentity } from '../identity/browser-execution-host-storage-identity'
import {
  deriveBrowserRoutePartition,
  deriveLocalSshBrowserRoutePartitionStorageScope
} from '../partitions/browser-route-identity'
import {
  activeBrowserRoutePartitionOpenKodoProfileId,
  currentBrowserRoutePartitionBindingStore
} from '../partitions/browser-route-partition-binding-runtime'
import { isBrowserRoutePartitionRetainedByAnyOwner } from '../partitions/browser-route-partition-retention'
import { releaseEvictedBrowserRoutePartitionStorage } from '../partitions/browser-route-partition-storage-dependencies'
import { browserSessionRegistry } from '../../sessions/profiles/browser-session-registry'

const AUTHORITY_CONNECTION_IDENTITY_TAG = 'openkodo-local-ssh-browser'
const AUTHORITY_CONNECTION_IDENTITY_VERSION = 1

// Keep the identity stable across restarts to preserve cookies.
export function localSshBrowserAuthorityConnectionIdentity(openkodoProfileId: string): string {
  return JSON.stringify([
    AUTHORITY_CONNECTION_IDENTITY_TAG,
    AUTHORITY_CONNECTION_IDENTITY_VERSION,
    openkodoProfileId
  ])
}

/** The jar a page or import already bound for this target and profile; null when none has. */
export function boundLocalSshBrowserPartition(
  targetId: string,
  browserProfileId: string
): string | null {
  const openkodoProfileId = activeBrowserRoutePartitionOpenKodoProfileId()
  if (!openkodoProfileId) {
    return null
  }
  const derived = deriveLocalSshBrowserPartition(openkodoProfileId, targetId, browserProfileId)
  const persisted = currentBrowserRoutePartitionBindingStore().get(derived.partition)
  if (persisted === null) {
    return null
  }
  if (persisted !== derived.bindingFingerprint) {
    throw new Error('browser_route_partition_binding_conflict')
  }
  return derived.partition
}

/** The jars these hosts' pages of one profile have bound; reads the binding file once for all hosts. */
export function boundLocalSshBrowserPartitionsForProfile(
  targetIds: readonly string[],
  browserProfileId: string
): string[] {
  const openkodoProfileId = activeBrowserRoutePartitionOpenKodoProfileId()
  if (!openkodoProfileId || targetIds.length === 0) {
    return []
  }
  const bindings = currentBrowserRoutePartitionBindingStore().listBindings()
  return targetIds.flatMap((targetId) => {
    const derived = deriveLocalSshBrowserPartition(openkodoProfileId, targetId, browserProfileId)
    // A different fingerprint is another identity's jar.
    return bindings.get(derived.partition)?.fingerprint === derived.bindingFingerprint
      ? [derived.partition]
      : []
  })
}

/** Binds the jar this target's pages of this profile will use, so Settings can fill it before any page opens. */
export function bindLocalSshBrowserPartition(targetId: string, browserProfileId: string): string {
  const openkodoProfileId = activeBrowserRoutePartitionOpenKodoProfileId()
  if (!openkodoProfileId) {
    throw new Error('browser_local_route_profile_unavailable')
  }
  browserSessionRegistry.requireRouteBrowserProfile(browserProfileId)
  return bindLocalSshBrowserPartitionFor(openkodoProfileId, targetId, browserProfileId).partition
}

export function bindLocalSshBrowserPartitionFor(
  openkodoProfileId: string,
  targetId: string,
  browserProfileId: string
): ReturnType<typeof deriveBrowserRoutePartition> {
  const derived = deriveLocalSshBrowserPartition(openkodoProfileId, targetId, browserProfileId)
  const bindings = currentBrowserRoutePartitionBindingStore({
    isPartitionRetained: isBrowserRoutePartitionRetainedByAnyOwner
  })
  const persistedFingerprint = bindings.get(derived.partition)
  if (persistedFingerprint === null) {
    const evicted = bindings.set(
      derived.partition,
      derived.bindingFingerprint,
      deriveLocalSshBrowserRoutePartitionStorageScope({ openkodoProfileId, targetId })
    )
    if (evicted.length > 0) {
      void releaseEvictedBrowserRoutePartitionStorage(
        evicted,
        isBrowserRoutePartitionRetainedByAnyOwner
      )
    }
  } else if (persistedFingerprint !== derived.bindingFingerprint) {
    throw new Error('browser_route_partition_binding_conflict')
  } else {
    bindings.touch(derived.partition)
  }
  return derived
}

export function deriveLocalSshBrowserPartition(
  openkodoProfileId: string,
  targetId: string,
  browserProfileId: string
): ReturnType<typeof deriveBrowserRoutePartition> {
  return deriveBrowserRoutePartition({
    openkodoProfileId,
    browserProfileId,
    authorityConnectionIdentity: localSshBrowserAuthorityConnectionIdentity(openkodoProfileId),
    executionHostIdentity: sshExecutionHostStorageIdentity(targetId)
  })
}
