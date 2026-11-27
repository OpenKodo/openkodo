// Validate blob contents before commit; install only advertised kinds after durable commit.
import { servesWslMovedPaneHistory } from '../../../openkodod/migration/openkodod-migration-wsl-destination'
import { readFileSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'
import type { OpenkododMigrationBlobKind } from '../../../../shared/openkodod-migration/openkodod-migration-blob-transfer'
import type { OpenkododMigrationManifest } from '../../../../shared/openkodod-migration/openkodod-migration-manifest'
import {
  OPENKODOD_MIGRATION_TERMINAL_RESTORE_HINTS_KEY,
  parseOpenkododMigrationTerminalRestoreHintsText,
  type OpenkododMigrationTerminalRestoreHint
} from '../../../../shared/openkodod-migration/openkodod-migration-terminal-restore-hints'
import { syncDirectoryDurablySync } from '../../../filesystem/durable-file-write'
import {
  getOpenkododMigrationReceivedBlobPath,
  stagedOpenkododMigrationBlobFiles
} from './openkodod-migration-blob-staging'
import {
  openkododMigrationStagingKey,
  type OpenkododMigrationRequestIdentity
} from './openkodod-migration-staged-file'
import {
  assertOpenkododMigrationShellHistoryValid,
  installOpenkododMigrationShellHistory
} from '../terminal-history/openkodod-shell-history-installer'
import {
  assertOpenkododMigrationTerminalHistoryValid,
  installOpenkododMigrationTerminalHistory
} from '../terminal-history/openkodod-terminal-history-installer'
import type {
  OpenkododTerminalRestoreHintPlacement,
  OpenkododTerminalRestoreHintStore
} from '../terminal-history/openkodod-terminal-restore-hint-store'

type OpenkododMigrationStagedBlobFile = {
  key: string
  path: string
  manifest: OpenkododMigrationManifest
}

type OpenkododMigrationBlobContentCheck = (file: OpenkododMigrationStagedBlobFile) => void

const UTF8 = new TextDecoder('utf-8', { fatal: true })

const BLOB_CONTENT_CHECKS: Partial<
  Record<OpenkododMigrationBlobKind, OpenkododMigrationBlobContentCheck>
> = {
  'terminal-restore-hints': ({ path }) => {
    parseOpenkododMigrationTerminalRestoreHintsText(decodeUtf8(readFileSync(path)))
  },
  'shell-history': ({ key, path, manifest }) => {
    assertOpenkododMigrationShellHistoryValid(key, path, manifest.payload)
  },
  'terminal-history': ({ key, path, manifest }) => {
    assertOpenkododMigrationTerminalHistoryValid(key, path, manifest)
  }
}

/** Reject malformed content before commit while the source still owns everything. */
export function assertOpenkododMigrationBlobContentsValid(
  manifest: OpenkododMigrationManifest,
  root: string
): void {
  for (const { descriptor, path } of stagedOpenkododMigrationBlobFiles(manifest, root)) {
    const check = BLOB_CONTENT_CHECKS[descriptor.blobKind]
    if (!check) {
      continue
    }
    try {
      check({ key: descriptor.key, path, manifest })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(`openkodod_migration_blob_content_invalid:${descriptor.blobKind}:${reason}`)
    }
  }
}

export type OpenkododMigrationBlobInstall = {
  migration: OpenkododMigrationRequestIdentity
  root: string
  terminalRestoreHints: OpenkododTerminalRestoreHintStore
  /** This host's getHistoryRoot(). */
  shellHistoryRoot: string
  /** This host's `getDaemonHistoryDir()`, where its terminals' checkpoints live. */
  terminalHistoryRoot: string
  /** The shell binary a new pane on this host would actually run. */
  paneShellPath: () => string
  /** Defer without runtime evidence: shells surviving a restart could overwrite installed history. */
  worktreeHasLiveShells?: (worktreeId: string) => boolean
  deferredShellHistoryWorktreeIds: Set<string>
  paneWorktreeId: (paneKey: string) => string | null
  /** The workspace's folder on this host, or null when it is not here. */
  workspacePath: (worktreeId: string) => string | null
  now: number
}

/** Retain failed blobs for retry; installed-migration markers prevent consumed hints from reviving. */
export function installOpenkododMigrationReceivedBlobs(
  install: OpenkododMigrationBlobInstall
): void {
  let firstError: unknown = null
  // Keep failures independent so other blob kinds can still install.
  for (const installKind of [
    installTerminalRestoreHints,
    installShellHistory,
    installTerminalHistory,
    removeImportedAutomationRunHistory
  ]) {
    try {
      installKind(install)
    } catch (error) {
      firstError ??= error
    }
  }
  if (firstError !== null) {
    throw firstError
  }
}

// The durable commit already holds these runs; the blob only served that commit.
function removeImportedAutomationRunHistory(install: OpenkododMigrationBlobInstall): void {
  rmSync(
    getOpenkododMigrationReceivedBlobPath(install.root, install.migration, {
      blobKind: 'automation-run-history',
      key: 'migration'
    }),
    { force: true }
  )
}

function installTerminalHistory(install: OpenkododMigrationBlobInstall): void {
  // Only a WSL host advertises terminal history, so no other destination should hold any.
  if (!servesWslMovedPaneHistory()) {
    return
  }
  installOpenkododMigrationTerminalHistory({
    migration: install.migration,
    root: install.root,
    historyRoot: install.terminalHistoryRoot,
    paneWorktreeId: install.paneWorktreeId,
    workspacePath: install.workspacePath,
    now: install.now
  })
}

function installShellHistory(install: OpenkododMigrationBlobInstall): void {
  if (!install.worktreeHasLiveShells) {
    return
  }
  installOpenkododMigrationShellHistory({
    migration: install.migration,
    root: install.root,
    historyRoot: install.shellHistoryRoot,
    paneShellPath: install.paneShellPath,
    worktreeHasLiveShells: install.worktreeHasLiveShells,
    deferredWorktreeIds: install.deferredShellHistoryWorktreeIds,
    now: install.now
  })
}

function installTerminalRestoreHints(install: OpenkododMigrationBlobInstall): void {
  const path = getOpenkododMigrationReceivedBlobPath(install.root, install.migration, {
    blobKind: 'terminal-restore-hints',
    key: OPENKODOD_MIGRATION_TERMINAL_RESTORE_HINTS_KEY
  })
  let bytes: Buffer
  try {
    bytes = readFileSync(path)
  } catch {
    return
  }
  const migrationKey = openkododMigrationStagingKey(install.migration)
  if (!install.terminalRestoreHints.hasInstalledMigration(migrationKey)) {
    try {
      const document = parseOpenkododMigrationTerminalRestoreHintsText(decodeUtf8(bytes))
      install.terminalRestoreHints.install(
        { migrationKey, migrationId: install.migration.migrationId },
        placeHints(document.hints, install.paneWorktreeId),
        install.now
      )
    } catch (error) {
      if (!isHintFormatError(error)) {
        throw error
      }
      // Pre-commit validation passed; damaged hints can only fall back to the default folder now.
      console.error(
        `[openkodod-migration] dropped unreadable terminal restore hints for ${install.migration.migrationId}:`,
        error
      )
    }
  }
  rmSync(path, { force: true })
  syncDirectoryDurablySync(dirname(path))
}

// Drop hints whose panes have no worktree on this host.
function placeHints(
  hints: readonly OpenkododMigrationTerminalRestoreHint[],
  paneWorktreeId: (paneKey: string) => string | null
): OpenkododTerminalRestoreHintPlacement[] {
  return hints.flatMap((hint) => {
    const worktreeId = paneWorktreeId(hint.paneKey)
    return worktreeId ? [{ ...hint, worktreeId }] : []
  })
}

function decodeUtf8(bytes: Buffer): string {
  try {
    return UTF8.decode(bytes)
  } catch {
    throw new Error('openkodod_migration_terminal_restore_hints_not_utf8')
  }
}

function isHintFormatError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith('openkodod_migration_terminal_restore_')
}
