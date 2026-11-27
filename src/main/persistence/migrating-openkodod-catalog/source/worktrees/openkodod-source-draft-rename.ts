// Drafts stay on this desktop; commit retargets their host records and restore checks disk baselines.
import type { OpenkododMigrationManifest } from '../../../../../shared/openkodod-migration/openkodod-migration-manifest'
import type { PersistedState } from '../../../../../shared/openkodo-profiles/persisted-state-types'
import type {
  PersistedOpenFile,
  WorkspaceSessionState
} from '../../../../../shared/workspace-session/workspace-session-state-types'
import {
  createOpenkododMigrationSourceScope,
  openkododMigrationOwnerMatchesScope,
  openkododMigrationPartitionScope,
  unqualifyOpenkododMigrationOwnerKey
} from '../catalog/openkodod-source-scope'
import { openkododMigrationSessionPartitions } from '../sessions/openkodod-source-session-partitions'

export type OpenkododMigrationSourceDrafts = Record<string, PersistedOpenFile[]>

export function isHostBoundOpenFile(file: PersistedOpenFile): boolean {
  return file.externalSshTargetId !== undefined || Boolean(file.runtimeEnvironmentId)
}

export function collectOpenkododMigrationSourceDrafts(
  state: PersistedState,
  manifest: Pick<OpenkododMigrationManifest, 'source' | 'payload'>
): OpenkododMigrationSourceDrafts {
  const sourceScope = createOpenkododMigrationSourceScope({
    source: manifest.source,
    catalog: manifest.payload,
    repos: state.repos
  })
  // Prefer the host copy on duplicate files, matching app reads.
  const partitions = openkododMigrationSessionPartitions(state, sourceScope).sort(
    ([a], [b]) => Number(b === sourceScope.hostId) - Number(a === sourceScope.hostId)
  )
  const drafts = new Map<string, Map<string, PersistedOpenFile>>()
  for (const [partitionId, session] of partitions) {
    const scope = openkododMigrationPartitionScope(sourceScope, partitionId)
    for (const [ownerKey, files] of Object.entries(session.openFilesByWorktree ?? {})) {
      if (!openkododMigrationOwnerMatchesScope(ownerKey, scope)) {
        continue
      }
      const key = unqualifyOpenkododMigrationOwnerKey(ownerKey)
      for (const file of files) {
        if (file.dirtyDraftContent === undefined || isHostBoundOpenFile(file)) {
          continue
        }
        const byPath = drafts.get(key) ?? new Map<string, PersistedOpenFile>()
        drafts.set(key, byPath)
        if (!byPath.has(file.filePath)) {
          byPath.set(file.filePath, { ...structuredClone(file), worktreeId: key })
        }
      }
    }
  }
  return Object.fromEntries([...drafts].map(([key, byPath]) => [key, [...byPath.values()]]))
}

/** Existing destination records win so discarded drafts cannot revive. */
export function withRenamedOpenkododMigrationDrafts(
  destination: WorkspaceSessionState,
  drafts: OpenkododMigrationSourceDrafts,
  destinationEnvironmentId: string
): WorkspaceSessionState | null {
  const openFilesByWorktree = { ...destination.openFilesByWorktree }
  let changed = false
  for (const [key, files] of Object.entries(drafts)) {
    const held = openFilesByWorktree[key] ?? []
    const heldPaths = new Set(held.map((file) => file.filePath))
    // Retarget reads and saves to the server without transferring draft contents.
    const added = files
      .filter((file) => !heldPaths.has(file.filePath))
      .map((file) => ({ ...file, runtimeEnvironmentId: destinationEnvironmentId }))
    if (added.length > 0) {
      openFilesByWorktree[key] = [...held, ...added]
      changed = true
    }
  }
  return changed ? { ...destination, openFilesByWorktree } : null
}

/** Strip unsaved contents from the session sent to the server. */
export function withoutOpenkododMigrationDrafts(
  session: WorkspaceSessionState
): WorkspaceSessionState {
  if (!session.openFilesByWorktree) {
    return session
  }
  return {
    ...session,
    openFilesByWorktree: Object.fromEntries(
      Object.entries(session.openFilesByWorktree).map(([key, files]) => [
        key,
        files.map(({ dirtyDraftContent: _draft, lastKnownDiskSignature: _base, ...file }) => file)
      ])
    )
  }
}
