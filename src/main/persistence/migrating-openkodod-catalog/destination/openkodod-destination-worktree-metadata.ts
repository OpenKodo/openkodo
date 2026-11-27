import type { PersistedState } from '../../../../shared/openkodo-profiles/persisted-state-types'

import {
  type OpenkododMigrationDormantStatePayload,
  serializeOpenkododMigrationValue
} from '../../../../shared/openkodod-migration/openkodod-migration-manifest'
import { canonicalWorktreeIdentity } from '../../../../shared/worktree/identity'
import { composeWorktreeHostIdentity } from '../../../../shared/worktree/host-qualified-identity'
import { omitDefaultWorktreeMetaFields } from '../../../../shared/worktree/metadata/meta-persisted-defaults'

export function assertOpenkododDestinationCanonicalMetadata(
  state: PersistedState,
  entries: OpenkododMigrationDormantStatePayload['worktreeMeta']
): void {
  for (const { worktreeId, meta } of entries) {
    const alias = composeWorktreeHostIdentity('local', worktreeId)
    const identities = state.worktreeIdentityAliases?.[alias] ?? []
    const expectedKey = meta.instanceId
      ? canonicalWorktreeIdentity({
          worktreeId,
          executionHostId: 'local',
          instanceId: meta.instanceId
        })
      : undefined
    const candidates = new Set([
      ...identities,
      ...(expectedKey && state.worktreeMetaByIdentity?.[expectedKey] ? [expectedKey] : [])
    ])
    if (
      candidates.size > 1 ||
      [...candidates].some((key) => {
        const current = state.worktreeMetaByIdentity?.[key]
        return (
          !current ||
          key !== expectedKey ||
          serializeOpenkododMigrationValue(omitDefaultWorktreeMetaFields(current)) !==
            serializeOpenkododMigrationValue(omitDefaultWorktreeMetaFields(meta))
        )
      })
    ) {
      throw new Error(`openkodod_migration_dormant_id_conflict:worktree_meta:${worktreeId}`)
    }
  }
}
