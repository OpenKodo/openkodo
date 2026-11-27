import type { OpenkododMigrationCatalogState } from '../../../../shared/openkodod-migration/openkodod-migration-manifest'

export async function resolveDurableOpenkododCatalogMutation(
  mutate: () => Promise<OpenkododMigrationCatalogState>,
  read: () => Promise<OpenkododMigrationCatalogState>,
  accepted: (state: OpenkododMigrationCatalogState) => boolean
) {
  try {
    return await mutate()
  } catch (mutationError) {
    let observed: OpenkododMigrationCatalogState
    try {
      observed = await read()
    } catch {
      throw mutationError
    }
    if (!accepted(observed)) {
      throw mutationError
    }
  }
  // State reads may reflect unflushed mutations; an idempotent acknowledgment proves durability.
  return mutate()
}
