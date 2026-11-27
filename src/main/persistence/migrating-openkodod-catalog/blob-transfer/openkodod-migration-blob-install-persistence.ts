import { OPENKODOD_MIGRATION_BLOB_KIND_CONTRACTS } from '../../../../shared/openkodod-migration/openkodod-migration-blob-transfer'
import type { OpenkododMigrationManifest } from '../../../../shared/openkodod-migration/openkodod-migration-manifest'
import type { PersistedState } from '../../../../shared/openkodo-profiles/persisted-state-types'
import { parsePaneKey } from '../../../../shared/workspace-layout/stable-pane-id'
import { getDaemonHistoryDir } from '../../../daemon/launch/daemon-launch-paths'
import { getHistoryRoot } from '../../../pty/history/terminal-history-paths'
import type { StoreRuntimeState } from '../../loading-store/store-runtime-state'
import {
  findOpenkododMigrationImportReceipt,
  isOpenkododMigrationCommitDurable
} from '../catalog-commit/openkodod-catalog-receipt-ledger'
import { installOpenkododMigrationReceivedBlobs } from './openkodod-migration-blob-installers'
import { listOpenkododMigrationReceivedBlobNames } from './openkodod-migration-blob-staging'
import type { OpenkododMigrationRequestIdentity } from './openkodod-migration-staged-file'

type OpenkododMigrationBlobInstallRuntime = Pick<
  StoreRuntimeState,
  | 'state'
  | 'openkododMigrationBlobRoot'
  | 'openkododTerminalRestoreHints'
  | 'paneShellPath'
  | 'deferredShellHistoryWorktreeIds'
  | 'writeGeneration'
  | 'lastDurableWriteGeneration'
  | 'openkododMigrationCommitWriteGenerations'
>

type ClockOptions = { now?: () => Date }
type InstallOptions = ClockOptions & {
  /** Defer history installation while shells run in its worktree. */
  worktreeHasLiveShells?: (worktreeId: string) => boolean
}

const openkododMigrationBlobInstallContext = Symbol('OpenkododMigrationBlobInstallPersistence')
type OpenkododMigrationBlobInstallContext = {
  runtime: OpenkododMigrationBlobInstallRuntime
}

export class OpenkododMigrationBlobInstallPersistence {
  readonly [openkododMigrationBlobInstallContext]: OpenkododMigrationBlobInstallContext

  constructor(runtime: OpenkododMigrationBlobInstallRuntime) {
    this[openkododMigrationBlobInstallContext] = { runtime }
  }

  /** Wait for durable commit or a restart could lose both the catalog and its consumed blobs. */
  installOpenkododMigrationReceivedBlobs(
    manifest: OpenkododMigrationManifest,
    options: InstallOptions = {}
  ): void {
    const receipt = findOpenkododMigrationImportReceipt(
      this[openkododMigrationBlobInstallContext].runtime.state,
      manifest
    )
    if (receipt?.manifestSha256 !== manifest.manifestSha256) {
      return
    }
    installCommitted(this[openkododMigrationBlobInstallContext].runtime, manifest, options)
  }

  /** Recover interrupted installs; disk-loaded receipts already prove durability. */
  installPendingOpenkododMigrationReceivedBlobs(options: InstallOptions = {}): void {
    const { runtime } = this[openkododMigrationBlobInstallContext]
    for (const receipt of [
      ...(runtime.state.openkododMigrationImportReceipts ?? []),
      ...(runtime.state.openkododMigrationEvictedReceipts ?? [])
    ]) {
      try {
        installCommitted(runtime, receipt, options)
      } catch (error) {
        console.error(
          `[openkodod-migration] installing received blobs for ${receipt.migrationId} failed:`,
          error
        )
      }
    }
  }

  /** Only the runtime installs pending shell history. */
  hasPendingOpenkododMigrationShellHistory(): boolean {
    const { runtime } = this[openkododMigrationBlobInstallContext]
    return [
      ...(runtime.state.openkododMigrationImportReceipts ?? []),
      ...(runtime.state.openkododMigrationEvictedReceipts ?? [])
    ].some((receipt) =>
      listOpenkododMigrationReceivedBlobNames(
        runtime.openkododMigrationBlobRoot,
        receipt,
        'shell-history'
      ).some((key) => OPENKODOD_MIGRATION_BLOB_KIND_CONTRACTS['shell-history'].key.test(key))
    )
  }

  installDeferredOpenkododMigrationShellHistory(
    worktreeId: string,
    options: InstallOptions = {}
  ): void {
    const { runtime } = this[openkododMigrationBlobInstallContext]
    if (runtime.deferredShellHistoryWorktreeIds.has(worktreeId)) {
      this.installPendingOpenkododMigrationReceivedBlobs(options)
    }
  }

  /** Read without consuming. */
  peekOpenkododMigrationTerminalRestoreHint(
    paneKey: string,
    worktreeId: string,
    options: ClockOptions = {}
  ): string | null {
    return this[openkododMigrationBlobInstallContext].runtime.openkododTerminalRestoreHints.peek(
      paneKey,
      worktreeId,
      clock(options)
    )
  }

  /** Consume after spawn, even if it used a different cwd. */
  consumeOpenkododMigrationTerminalRestoreHint(paneKey: string, options: ClockOptions = {}): void {
    this[openkododMigrationBlobInstallContext].runtime.openkododTerminalRestoreHints.consume(
      paneKey,
      clock(options)
    )
  }
}

function installCommitted(
  runtime: OpenkododMigrationBlobInstallRuntime,
  migration: OpenkododMigrationRequestIdentity,
  options: InstallOptions
): void {
  if (!isOpenkododMigrationCommitDurable(runtime, migration)) {
    return
  }
  installOpenkododMigrationReceivedBlobs({
    migration,
    root: runtime.openkododMigrationBlobRoot,
    terminalRestoreHints: runtime.openkododTerminalRestoreHints,
    shellHistoryRoot: getHistoryRoot(),
    terminalHistoryRoot: getDaemonHistoryDir(),
    paneShellPath: () => runtime.paneShellPath(runtime.state.settings?.terminalDefaultShell),
    worktreeHasLiveShells: options.worktreeHasLiveShells,
    deferredShellHistoryWorktreeIds: runtime.deferredShellHistoryWorktreeIds,
    paneWorktreeId: (paneKey) => findPaneWorktreeId(runtime.state, paneKey),
    workspacePath: (worktreeId) => findWorkspacePath(runtime.state, worktreeId),
    now: clock(options)
  })
}

function clock(options: ClockOptions): number {
  return (options.now ?? (() => new Date()))().getTime()
}

// A git worktree id carries its path; a folder workspace's is on its record.
function findWorkspacePath(state: PersistedState, worktreeId: string): string | null {
  const separator = worktreeId.indexOf('::')
  if (separator > 0) {
    return worktreeId.slice(separator + 2) || null
  }
  return state.folderWorkspaces.find((folder) => folder.id === worktreeId)?.folderPath ?? null
}

// The commit merged the moved session in with its worktree ids unchanged.
function findPaneWorktreeId(state: PersistedState, paneKey: string): string | null {
  const tabId = parsePaneKey(paneKey)?.tabId
  if (!tabId) {
    return null
  }
  const sessions = [state.workspaceSession, ...Object.values(state.workspaceSessionsByHostId ?? {})]
  for (const session of sessions) {
    for (const [worktreeId, tabs] of Object.entries(session?.tabsByWorktree ?? {})) {
      if (tabs.some((tab) => tab.id === tabId)) {
        return worktreeId
      }
    }
  }
  return null
}
