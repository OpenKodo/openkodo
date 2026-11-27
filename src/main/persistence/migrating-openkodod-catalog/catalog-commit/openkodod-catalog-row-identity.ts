import { serializeOpenkododMigrationValue } from '../../../../shared/openkodod-migration/openkodod-migration-manifest'
import type { Repo } from '../../../../shared/repository/repo-types'

export function selectNewRows<T extends { id: string }>(
  incoming: T[],
  existing: T[],
  conflictError: (id: string) => string,
  sameRow: (left: T, right: T) => boolean = (left, right) =>
    serializeOpenkododMigrationValue(left) === serializeOpenkododMigrationValue(right)
): T[] {
  const existingById = new Map(existing.map((row) => [row.id, row]))
  return incoming.filter((row) => {
    const current = existingById.get(row.id)
    if (!current) {
      return true
    }
    if (!sameRow(current, row)) {
      throw new Error(conflictError(row.id))
    }
    return false
  })
}

function isAutomaticGitHubIcon(repo: Repo): boolean {
  return repo.repoIcon?.type === 'image' && repo.repoIcon.source === 'github'
}

function withoutHostProbeCache(repo: Repo, dropIcon: boolean): Partial<Repo> {
  const { gitRemoteIdentity: _identity, repoIcon, ...configuration } = repo
  return dropIcon ? configuration : { ...configuration, repoIcon }
}

export function sameOpenkododRepositoryConfiguration(current: Repo, incoming: Repo): boolean {
  // Preserve this host's Git probe and the automatic avatar enriched alongside it.
  const dropIcon = isAutomaticGitHubIcon(current) && isAutomaticGitHubIcon(incoming)
  return (
    serializeOpenkododMigrationValue(withoutHostProbeCache(current, dropIcon)) ===
    serializeOpenkododMigrationValue(withoutHostProbeCache(incoming, dropIcon))
  )
}

export function assertSameValue(left: unknown, right: unknown, label: string): void {
  if (serializeOpenkododMigrationValue(left) !== serializeOpenkododMigrationValue(right)) {
    throw new Error(`openkodod_migration_dormant_id_conflict:${label}`)
  }
}
