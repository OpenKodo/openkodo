/** How this copy of OpenKodo was installed; decides the last step the user takes to delete the app. */
export type OpenKodoUninstallInstallKind =
  | 'mac-app'
  | 'mac-homebrew'
  | 'windows-installer'
  | 'linux-appimage'
  | 'linux-package'
  | 'unknown'

/** One part of the cleanup, run in this order. */
export type OpenKodoUninstallStep =
  | 'agent-hooks'
  | 'cli-command'
  | 'background-service'
  | 'hook-scripts'
  | 'ssh-hosts'
  | 'terminal-daemon'

export const OPENKODO_UNINSTALL_STEPS: readonly OpenKodoUninstallStep[] = [
  'agent-hooks',
  'cli-command',
  'background-service',
  'hook-scripts',
  'ssh-hosts',
  // Last, so no other step depends on it; it ends the user's open terminals.
  'terminal-daemon'
]

/**
 * `kept-shared`: another OpenKodo build still uses it, so it stays.
 * `needs-user`: OpenKodo can't do it from here (an offline SSH host); the entry names what to run.
 */
export type OpenKodoUninstallEntryState =
  | 'present'
  | 'removed'
  | 'kept-shared'
  | 'needs-user'
  | 'error'

/** A file OpenKodo changes; `openkodoData` is set when it sits in OpenKodo's own data folder. */
export type OpenKodoUninstallPath = {
  /** The full path, with the home folder shown as `~`. */
  path: string
  /** `relative` is the part after the account home or the data folder. */
  openkodoData: { kind: 'codex-account' | 'app-data'; relative: string } | null
}

export type OpenKodoUninstallAgentEntry = {
  agent: string
  /** Every file OpenKodo changes or deletes for this agent. */
  paths: OpenKodoUninstallPath[]
  state: OpenKodoUninstallEntryState
  /** One short line, e.g. "Permission denied". */
  detail: string | null
}

export type OpenKodoUninstallHostEntry = {
  hostId: string
  label: string
  connected: boolean
  state: OpenKodoUninstallEntryState
  detail: string | null
}

export type OpenKodoUninstallSimpleEntry = {
  /** What the row shows on the right: a path, a command name, or a service label. */
  location: string
  state: OpenKodoUninstallEntryState
  detail: string | null
}

/** What would change, and after a step runs, what did. Steps with nothing to do are null or empty. */
export type OpenKodoUninstallPlan = {
  installKind: OpenKodoUninstallInstallKind
  agents: OpenKodoUninstallAgentEntry[]
  cliCommand: (OpenKodoUninstallSimpleEntry & { commandName: string }) | null
  backgroundService: OpenKodoUninstallSimpleEntry | null
  hookScripts: OpenKodoUninstallSimpleEntry | null
  hosts: OpenKodoUninstallHostEntry[]
  /** This machine's terminal daemon, present only while one is running; stopping it ends open terminals. */
  terminalDaemon: OpenKodoUninstallSimpleEntry | null
  /** Set when another OpenKodo build (stable, RC or dev) still uses the shared hooks. */
  otherOpenKodoBuildName: string | null
  /** The app bundle, AppImage or install folder to reveal, when there is one. */
  appPath: string | null
  /** The command that deletes the app when the OS needs one (Homebrew, apt, dnf). */
  removeAppCommand: string | null
}

export type OpenKodoUninstallRunStepArgs = {
  step: OpenKodoUninstallStep
  /** Retry only these agents or hosts. */
  only?: string[]
}

export type OpenKodoUninstallFinishAction = 'quit' | 'reveal-app' | 'open-windows-uninstaller'
