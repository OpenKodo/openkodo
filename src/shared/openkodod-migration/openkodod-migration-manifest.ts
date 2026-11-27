import type { FolderWorkspace } from '../folder-workspaces/folder-workspace-types'
import type { Automation } from '../automations/automation-definition'
import type { AutomationRun } from '../automations/history/automation-run'
import type { OpenkododMigrationManifestVersion } from './openkodod-migration-manifest-validation'
import type { ProjectGroup } from '../project/groups/project-group-types'
import type { Repo } from '../repository/repo-types'
import type { SparsePreset } from '../worktree/create-types'
import type { WorkspaceLineage, WorktreeLineage } from '../worktree/lineage-types'
import type { WorktreeMeta } from '../worktree/meta-types'
import type { RetiredNameRegistry } from '../worktree/naming/retired-name-registry'
import type { WorkspaceSessionState } from '../workspace-session/workspace-session-state-types'
import type { OpenkododMigrationClientStatePayload } from './openkodod-migration-client-state'
import type {
  OpenkododMigrationSnapshotUploadState,
  OpenkododMigrationTerminalScrollbackSnapshot
} from './openkodod-migration-scrollback'
import type { OpenkododMigrationBlobUploadState } from './openkodod-migration-blob-transfer'

import { isRecord } from './openkodod-migration-manifest-fields'

/** The relay-era SSH source: on the wire it never carries `kind` (see openkodod-migration-source-kind). */
export type OpenkododMigrationSshManifestSource = {
  sshTargetId: string
  sshTargetGeneration: number | null
  targetLabel: string
}

/** Explicit desktop WSL project scope prevents destination path inference; generation orders delta moves. */
export type OpenkododMigrationLocalWslManifestSource = {
  kind: 'local-wsl'
  distro: string
  /** The distro's registry id, when known: a re-registered distro of the same name is another one. */
  distroGuid?: string
  scopeRepoIds: string[]
  scopeFolderWorkspaceIds: string[]
  generation: number
}

export type OpenkododMigrationManifestSource =
  | OpenkododMigrationSshManifestSource
  | OpenkododMigrationLocalWslManifestSource

export type OpenkododMigrationCatalogPayload = {
  repositories: Repo[]
  projectGroups: ProjectGroup[]
  folderWorkspaces: FolderWorkspace[]
  dormantState?: OpenkododMigrationDormantStatePayload
}

export type OpenkododMigrationDormantWorktreeMeta = {
  sourceKey: string
  worktreeId: string
  meta: WorktreeMeta
}

export type OpenkododMigrationDormantWorktreeLineage = {
  sourceKey: string
  worktreeId: string
  lineage: WorktreeLineage
}

export type OpenkododMigrationDormantWorkspaceLineage = {
  sourceKey: string
  childWorkspaceKey: string
  lineage: WorkspaceLineage
}

export type OpenkododMigrationDormantRetiredNames = {
  repoId: string
  registry: RetiredNameRegistry
}

export type OpenkododMigrationDormantRetirementNamespace = {
  sourceNamespaceKeys: string[]
  namespaceKey: string
  registry: RetiredNameRegistry
}

export type OpenkododMigrationAutomationRunHistoryRef = {
  sha256: string
  byteLength: number
}

export type OpenkododMigrationDormantStatePayload = {
  version: 1
  worktreeMeta: OpenkododMigrationDormantWorktreeMeta[]
  worktreeLineage: OpenkododMigrationDormantWorktreeLineage[]
  workspaceLineage: OpenkododMigrationDormantWorkspaceLineage[]
  sparsePresets: SparsePreset[]
  retiredWorktreeNames: OpenkododMigrationDormantRetiredNames[]
  retiredWorktreeNamespaces: OpenkododMigrationDormantRetirementNamespace[]
  workspaceSession?: WorkspaceSessionState
  terminalScrollbackSnapshots?: OpenkododMigrationTerminalScrollbackSnapshot[]
  automations?: Automation[]
  /** Inline runs, as older desktops send them; never alongside `automationRunHistory`. */
  automationRuns?: AutomationRun[]
  /** Digest of the runs sent as an `automation-run-history` blob, so history never bounds the manifest. */
  automationRunHistory?: OpenkododMigrationAutomationRunHistoryRef
  /** Client-owned durable intent projected to the destination authority. */
  clientState?: OpenkododMigrationClientStatePayload
}

export type OpenkododMigrationManifest = {
  version: OpenkododMigrationManifestVersion
  migrationId: string
  createdAt: string
  source: OpenkododMigrationManifestSource
  payload: OpenkododMigrationCatalogPayload
  /** Destination runtime identity used to re-key desktop routing after commit. */
  destinationEnvironmentId?: string
  manifestSha256: string
}

export type OpenkododMigrationImportReceipt = {
  version: OpenkododMigrationManifestVersion
  migrationId: string
  manifestSha256: string
  source: OpenkododMigrationManifestSource
  importedAt: string
  repositoryIds: string[]
  projectGroupIds: string[]
  folderWorkspaceIds: string[]
}

export type OpenkododMigrationStagedCatalog = {
  version: OpenkododMigrationManifestVersion
  manifest: OpenkododMigrationManifest
  stagedAt: string
}

export type OpenkododMigrationCatalogState =
  | {
      state: 'absent'
      migrationId: string
      manifestSha256: string
    }
  | {
      state: 'staged'
      migrationId: string
      manifestSha256: string
      stagedAt: string
      snapshotUploads?: OpenkododMigrationSnapshotUploadState[]
      /** Blobs staged so far; absent from hosts without the blob channel. */
      blobUploads?: OpenkododMigrationBlobUploadState[]
    }
  | {
      state: 'committed'
      migrationId: string
      manifestSha256: string
      receipt: OpenkododMigrationImportReceipt
    }

export type OpenkododMigrationCatalogAbortResult = OpenkododMigrationCatalogState & {
  aborted: boolean
  durableAbsent?: true
}

export type OpenkododMigrationCatalogReference = Pick<
  OpenkododMigrationManifest,
  'migrationId' | 'manifestSha256'
>

/** An abort by reference: no receipt, since an evicted one is rebuilt only from the manifest. */
export type OpenkododMigrationCatalogReferenceAbortResult = OpenkododMigrationCatalogReference & {
  state: 'absent' | 'committed'
  aborted: boolean
  durableAbsent?: true
  /** The receipt was flushed before this answer; older hosts never send it. */
  durableCommitted?: true
}

export function openkododMigrationManifestHashInput(
  manifest: Omit<OpenkododMigrationManifest, 'manifestSha256'>
): string {
  return serializeOpenkododMigrationValue(manifest)
}

export function serializeOpenkododMigrationValue(value: unknown): string {
  return JSON.stringify(canonicalizeJsonValue(value))
}

function canonicalizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJsonValue)
  }
  if (!isRecord(value)) {
    return value
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => [key, canonicalizeJsonValue(entry)])
  )
}
