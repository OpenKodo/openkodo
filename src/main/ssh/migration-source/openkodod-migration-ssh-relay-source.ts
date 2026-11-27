import { OPENKODOD_MIGRATION_SSH_RELAY_SOURCE_KIND } from '../../../shared/openkodod-migration/openkodod-migration-source-kind'
import type { SshTarget } from '../../../shared/remote-runtime/ssh/ssh-types'
import { collectOpenkododMigrationSourceCatalog } from '../../persistence/migrating-openkodod-catalog/source/catalog/openkodod-source-catalog'
import type { Store } from '../../persistence/loading-store/store'
import { createOpenkododMigrationManifest } from '../../persistence/migrating-openkodod-catalog/source/catalog/openkodod-migration-manifest-export'
import { IDENTITY_OPENKODOD_MIGRATION_PATH_REWRITER } from '../../persistence/migrating-openkodod-catalog/path-rewrite/openkodod-migration-path-rewrite'
import type {
  OpenkododMigrationSource,
  OpenkododMigrationSourceCutoverPort
} from '../../managed-server/migration/cutover/openkodod-migration-source'
import { assertOpenkododMigrationSourceUnchanged } from './openkodod-migration-source-assertions'
import {
  fenceOpenkododMigrationSource,
  releaseOpenkododMigrationFence,
  resolveOpenkododMigrationFence
} from './openkodod-migration-source-fence'
import {
  assessOpenkododMigrationTerminals,
  retireProvenExitedLeases,
  type CensusHostRelayTerminals
} from './openkodod-migration-terminal-gate'
import type { SshTargetOpenkododClaims } from '../targets/ssh-target-openkodod-claims'
import type { OpenkododMigrationPreflightStore } from '../targets/ssh-target-openkodod-preflight'
import type { OpenkododMigrationPaneLeasePredicate } from './openkodod-migration-bridged-panes'

type SshRelayCutoverDeps = {
  userDataPath: string
  store: OpenkododMigrationPreflightStore
  claims: SshTargetOpenkododClaims
  /** Rebuild copied stores for every check so later edits remain visible. */
  freshSource?: () => OpenkododMigrationPreflightStore
  signal?: AbortSignal
}

export function sshRelayMigrationCutoverPort(
  deps: SshRelayCutoverDeps
): OpenkododMigrationSourceCutoverPort {
  return {
    verifyFence: (cutover) =>
      assertOpenkododMigrationSourceUnchanged(
        { userDataPath: deps.userDataPath, store: deps.freshSource?.() ?? deps.store },
        cutover
      ),
    releaseFence: (cutover) => releaseOpenkododMigrationFence(deps, cutover)
  }
}

export function createSshRelayMigrationSource(
  deps: SshRelayCutoverDeps & {
    store: OpenkododMigrationPreflightStore &
      Pick<Store, 'getSshRemotePtyLeases' | 'markSshRemotePtyLease'>
    target: SshTarget
    /** Every relay endpoint on the host's account; without it exit can never be proven. */
    censusHost?: CensusHostRelayTerminals | null
    isBridgedPaneLease?: OpenkododMigrationPaneLeasePredicate
  }
): OpenkododMigrationSource {
  const { userDataPath, store, target } = deps
  return {
    ...sshRelayMigrationCutoverPort(deps),
    kind: OPENKODOD_MIGRATION_SSH_RELAY_SOURCE_KIND,
    journalKey: target.id,
    collectCatalog: () => collectOpenkododMigrationSourceCatalog(store, target),
    exportManifest: (options = {}) =>
      createOpenkododMigrationManifest(store, target, {
        ...options,
        rewrite: IDENTITY_OPENKODOD_MIGRATION_PATH_REWRITER
      }),
    assessTerminals: () => assessOpenkododMigrationTerminals(store, target.id, deps.censusHost),
    retireProvenExitedTerminals: (proof) => retireProvenExitedLeases(store, target.id, proof),
    resolveFence: () => resolveOpenkododMigrationFence(userDataPath, target),
    acquireFence: (args) =>
      fenceOpenkododMigrationSource({
        userDataPath,
        store,
        claims: deps.claims,
        targetId: target.id,
        isBridgedPaneLease: deps.isBridgedPaneLease,
        ...args
      })
  }
}
