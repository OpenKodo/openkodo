import type { FolderWorkspace } from '../folder-workspaces/folder-workspace-types'
import type { Repo } from '../repository/repo-types'
import type { SavedPortForward, SshRemotePtyLease } from '../remote-runtime/ssh/ssh-types'

export const OPENKODOD_MIGRATION_DEPENDENCY_KINDS = [
  'saved-port-forward',
  'terminal-lease',
  'terminal-recovery',
  'workspace-session',
  'worktree-metadata',
  'worktree-lineage',
  'workspace-lineage',
  'sparse-preset',
  'retired-worktree-name',
  'automation',
  'automation-run',
  'mobile-tab-selection',
  'ui-routing'
] as const

export type OpenkododMigrationDependencyKind = (typeof OPENKODOD_MIGRATION_DEPENDENCY_KINDS)[number]

export type OpenkododMigrationDependency = {
  kind: OpenkododMigrationDependencyKind
  count: number
  /** A bounded sample of what holds the reference, so the user can find and clear it. */
  names?: string[]
}

export type OpenkododMigrationRepository = Pick<Repo, 'id' | 'path' | 'displayName' | 'kind'>
export type OpenkododMigrationFolderWorkspace = Pick<FolderWorkspace, 'id' | 'name' | 'folderPath'>
export type OpenkododMigrationTerminalLease = Pick<
  SshRemotePtyLease,
  'ptyId' | 'worktreeId' | 'tabId' | 'leafId' | 'state' | 'updatedAt'
>

export type OpenkododMigrationBlocker =
  | {
      code: 'openkodod_migration_target_not_found'
      category: 'registration'
    }
  | {
      code: 'openkodod_migration_target_owned'
      category: 'exclusive-ownership'
      holder:
        | { kind: 'runtime'; runtimeId: string }
        | { kind: 'managed-server'; environmentId: string }
    }
  | {
      /** Owned by the asking environment, but no durable record of why. */
      code: 'openkodod_migration_owner_unrecorded'
      category: 'exclusive-ownership'
    }
  | {
      code: 'openkodod_migration_direct_ssh_repositories'
      category: 'drainable-static-state'
      repositories: OpenkododMigrationRepository[]
    }
  | {
      code: 'openkodod_migration_direct_ssh_folder_workspaces'
      category: 'drainable-static-state'
      folderWorkspaces: OpenkododMigrationFolderWorkspace[]
    }
  | {
      code: 'openkodod_migration_direct_ssh_terminal_leases'
      category: 'live-or-unverifiable'
      terminalLeases: OpenkododMigrationTerminalLease[]
    }
  | {
      code: 'openkodod_migration_saved_port_forwards'
      category: 'client-owned-state'
      portForwards: SavedPortForward[]
    }
  | {
      code: 'openkodod_migration_dependent_state'
      category: 'client-owned-state'
      dependencies: OpenkododMigrationDependency[]
    }
  | {
      code: 'openkodod_migration_dependency_unverifiable'
      category: 'live-or-unverifiable'
      sources: OpenkododMigrationDependencyKind[]
    }

export type OpenkododMigrationPreflight = {
  targetId: string
  targetLabel: string | null
  claimable: boolean
  blockers: OpenkododMigrationBlocker[]
}
