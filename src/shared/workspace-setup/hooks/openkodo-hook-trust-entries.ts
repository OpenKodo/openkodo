import type {
  PersistedTrustedOpenKodoHookRepo,
  PersistedTrustedOpenKodoHooks
} from '../openkodo-yaml-hook-types'

export type OpenKodoHookTrustKind = Exclude<keyof PersistedTrustedOpenKodoHookRepo, 'all'>

const OPENKODO_HOOK_TRUST_KINDS = [
  'setup',
  'archive',
  'issueCommand',
  'vmRecipe'
] as const satisfies readonly OpenKodoHookTrustKind[]

export function isOpenKodoHookRepoIdOnSeveralHosts(
  repos: readonly { id: string }[],
  repoId: string
): boolean {
  return repos.filter((repo) => repo.id === repoId).length > 1
}

export function canUseRepoWideTrust(
  trust: PersistedTrustedOpenKodoHooks,
  repos: readonly { id: string }[],
  repoId: string
): boolean {
  // Why: with the id on two hosts, trusting one row's script could run the other's unseen.
  return Boolean(trust[repoId]?.all) && !isOpenKodoHookRepoIdOnSeveralHosts(repos, repoId)
}

/** Repo-wide trust; on a single host, an approval of any hook kind also trusts the repo. */
export function isOpenKodoHookRepoTrusted(
  trust: PersistedTrustedOpenKodoHooks,
  repos: readonly { id: string }[],
  repoId: string
): boolean {
  if (canUseRepoWideTrust(trust, repos, repoId)) {
    return true
  }
  return (
    !isOpenKodoHookRepoIdOnSeveralHosts(repos, repoId) &&
    OPENKODO_HOOK_TRUST_KINDS.some(
      (kind) => approvedOpenKodoHookContentHashes(trust, repoId, kind).length > 0
    )
  )
}

// Bounded, so a long-lived repo can't accumulate every script it ever had; large enough that
// switching between branches with different setup scripts rarely re-prompts.
export const MAX_APPROVED_OPENKODO_HOOK_HASHES = 20

/** Every content hash approved for this script, newest first. */
export function approvedOpenKodoHookContentHashes(
  trust: PersistedTrustedOpenKodoHooks,
  repoId: string,
  kind: OpenKodoHookTrustKind
): string[] {
  const entry: unknown = trust[repoId]?.[kind]
  if (!entry || typeof entry !== 'object') {
    return []
  }
  const latest = 'contentHash' in entry ? entry.contentHash : undefined
  const previous = 'previousContentHashes' in entry ? entry.previousContentHashes : undefined
  const hashes = [latest, ...(Array.isArray(previous) ? previous : [])].filter(
    (hash): hash is string => typeof hash === 'string' && hash.length > 0 && hash.length <= 128
  )
  return [...new Set(hashes)].slice(0, MAX_APPROVED_OPENKODO_HOOK_HASHES)
}

export function isOpenKodoHookContentApproved(
  trust: PersistedTrustedOpenKodoHooks,
  repoId: string,
  kind: OpenKodoHookTrustKind,
  contentHash: string
): boolean {
  return approvedOpenKodoHookContentHashes(trust, repoId, kind).includes(contentHash)
}

/** Returns `trust` itself when the approval is already the latest one recorded. */
export function withOpenKodoHookScriptConfirmed(
  trust: PersistedTrustedOpenKodoHooks,
  repoId: string,
  kind: OpenKodoHookTrustKind,
  contentHash: string,
  approvedAt: number = Date.now()
): PersistedTrustedOpenKodoHooks {
  const existing = trust[repoId]
  if (existing?.[kind]?.contentHash === contentHash) {
    return trust
  }
  const previousContentHashes = approvedOpenKodoHookContentHashes(trust, repoId, kind)
    .filter((hash) => hash !== contentHash)
    .slice(0, MAX_APPROVED_OPENKODO_HOOK_HASHES - 1)
  return {
    ...trust,
    [repoId]: {
      ...existing,
      [kind]: {
        contentHash,
        approvedAt,
        ...(previousContentHashes.length > 0 ? { previousContentHashes } : {})
      }
    }
  }
}

/** Returns `trust` itself when the repo is already always-trusted. */
export function withOpenKodoHookRepoAlwaysTrusted(
  trust: PersistedTrustedOpenKodoHooks,
  repoId: string,
  approvedAt: number = Date.now()
): PersistedTrustedOpenKodoHooks {
  const existing = trust[repoId]
  if (existing?.all) {
    return trust
  }
  return { ...trust, [repoId]: { ...existing, all: { approvedAt } } }
}
