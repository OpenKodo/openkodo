export type SetupRunPolicy = 'ask' | 'run-by-default' | 'skip-by-default'
export type SetupAgentStartupPolicy = 'start-immediately' | 'wait-for-setup'
export type HookCommandSourcePolicy = 'shared-only' | 'local-only' | 'run-both'

export type OpenKodoHooks = {
  scripts: {
    setup?: string // Runs after worktree is created
    archive?: string // Runs before worktree is archived
  }
  setupAgentStartupPolicy?: SetupAgentStartupPolicy
  issueCommand?: string // Shared default command for linked GitHub issues
  defaultTabs?: OpenKodoDefaultTabTemplate[] // Terminal tabs to create once for a new worktree
  environmentRecipes?: OpenKodoVmRecipe[] // Project-scoped per-workspace environment recipes
  environmentRecipeDiagnostics?: OpenKodoVmRecipeDiagnostic[] // Non-fatal validation issues from environmentRecipes
  worktree?: OpenKodoWorktreeDefaults // Project-scoped defaults applied when a worktree is created
}

export type OpenKodoWorktreeDefaults = {
  // Share large rebuildable directories such as node_modules across worktrees instead of copying installs.
  sharedDirectories?: string[]
}

export type OpenKodoDefaultTabTemplate = {
  title?: string
  color?: string
  command?: string
}

export type EphemeralVmCheckoutMode = 'openkodo-worktree' | 'provisioned-root'

export type OpenKodoVmRecipe = {
  id: string
  name: string
  create: string
  checkoutMode?: EphemeralVmCheckoutMode
  description?: string
  suspend?: string
  resume?: string
  destroy?: string
  destroyDisabled?: boolean
  // Per-mode wall-clock limits; openkodo.yaml accepts one number for every mode or a per-mode map.
  timeoutSeconds?: OpenKodoVmRecipeTimeoutSeconds
  // Opt-in allowlist of OpenKodo's environment variables the scripts receive (plus a safe base set).
  // Omitted means scripts inherit the full environment.
  passEnv?: string[]
}

export type OpenKodoVmRecipeLifecycleMode = 'create' | 'suspend' | 'resume' | 'destroy'

export type OpenKodoVmRecipeTimeoutSeconds = Partial<Record<OpenKodoVmRecipeLifecycleMode, number>>

export type OpenKodoVmRecipeDiagnostic = {
  index: number
  field?: string
  message: string
}

export type RepoHookSettings = {
  // Retain the old hook-UI mode so persisted state reads without migration.
  mode: 'auto' | 'override'
  setupRunPolicy?: SetupRunPolicy
  setupAgentStartupPolicy?: SetupAgentStartupPolicy
  commandSourcePolicy?: HookCommandSourcePolicy
  scripts: {
    setup: string
    archive: string
  }
}

export type PersistedTrustedOpenKodoHookEntry = {
  contentHash: string
  approvedAt: number
  /** Earlier approvals, newest first, so switching between branches' scripts doesn't re-prompt. */
  previousContentHashes?: string[]
}

export type PersistedTrustedOpenKodoHookRepo = {
  all?: {
    approvedAt: number
  }
  setup?: PersistedTrustedOpenKodoHookEntry
  archive?: PersistedTrustedOpenKodoHookEntry
  issueCommand?: PersistedTrustedOpenKodoHookEntry
  vmRecipe?: PersistedTrustedOpenKodoHookEntry
}

export type PersistedTrustedOpenKodoHooks = Record<string, PersistedTrustedOpenKodoHookRepo>
