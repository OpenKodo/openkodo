import type { BackendCoreHost } from './core-runtime'
import type { OpenkododHandle } from '../openkodod/serve-startup/openkodod-start-contract'
import type { BackendCoreProfileShutdown } from './core-profile-shutdown'
import { prepareBackendDaemon } from './core-daemon-startup'
import { prepareWorktreeRemovalsForStore } from '../workspaces/removal/worktree-removal-records-load'
import { worktreeRemovalLifetime } from '../workspaces/removal/worktree-removal-lifetime'
import { getAppEnvironment } from '../../shared/app-lifecycle/app-environment'
import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host/execution-host'
import {
  describeOpenkododBindExposure,
  resolveOpenkododBindHost
} from '../../shared/remote-runtime/openkodod-lifecycle/openkodod-bind-address'
import {
  startOpenkododAgentSessionRecordStoreOpen,
  stopOpenkododStructuredAgentSessions
} from '../openkodod/host-lifecycle/openkodod-lifecycle'
import type { BackendServiceCleanup } from './service-composition'
import { bindOpenkododStopTerminalAdmission } from '../openkodod/host-lifecycle/managed-stop/openkodod-stop-terminal-admission'
import { beginOpenkododIdleExit } from '../openkodod/host-lifecycle/idle-exit/openkodod-managed-idle-exit-host'
import {
  openkododSchedulersKeepHostBusy,
  startOpenkododSchedulers
} from '../openkodod/host-runtime/openkodod-schedulers'
import {
  changedAiVaultSearchSettings,
  type AiVaultSearchSettings
} from '../../shared/ai-vault/search/ai-vault-search-settings'
import { adoptWslHostLoginEnvironmentLogged } from '../openkodod/host-runtime/openkodod-wsl-host-login-environment'
import { createOpenkododStartupTiming } from '../openkodod/diagnostics/openkodod-startup-timing'
import { OPENKODO_LAYOUT_OWNER_IS_MAIN } from '../../shared/workspace-layout/layout-owner-switch'
import { restoreOpenkododTerminalAuthority } from '../openkodod/host-runtime/openkodod-restored-terminal-authority'
import { installOpenkododFeatureReadiness } from '../runtime/rpc/startup/openkodod-readiness'
import { isAgentStatusHooksEnabled } from '../../shared/agent-hook-listener/configuration/agent-status-hooks-setting'
import {
  installOpenkododConnectorHost,
  installOpenkododRelayAndAccount
} from '../openkodod/openkodod-openkodo-account'

export async function activateBackendRuntime(
  host: BackendCoreHost,
  registerCleanup: (cleanup: BackendServiceCleanup) => void,
  profileShutdown: BackendCoreProfileShutdown,
  setObservabilityCleanup: (close: () => Promise<void>) => void
): Promise<Pick<OpenkododHandle, 'readiness'>> {
  const { options } = host
  const { time: timed, report: reportStartupTiming } = createOpenkododStartupTiming()
  // Overlap login-shell probing with imports and store startup.
  const loginEnvironment = adoptWslHostLoginEnvironmentLogged()
  const { ready: daemonStartup } = await prepareBackendDaemon(
    loginEnvironment,
    timed,
    registerCleanup
  )
  const { OpenKodoRuntimeService } = await import('../runtime/openkodo-runtime')
  const { createOpenkododRuntimeRpcServer } =
    await import('../openkodod/host-runtime/openkodod-runtime-rpc')
  const { registerHeadlessPtyRuntime } = await import('../ipc/pty/register-headless-runtime')
  const { getLocalPtyProvider } = await import('../ipc/pty/provider/registry')
  const { installOpenkododObservability } =
    await import('../openkodod/diagnostics/openkodod-observability')
  setObservabilityCleanup(installOpenkododObservability())
  const { ServeReadinessPublisher } = await import('../server/serve-readiness')
  const { servePublishMode } = await import('../server/serve-pairing-readiness')
  const { buildOpenkododServeReadiness } =
    await import('../openkodod/serve-startup/openkodod-serve-readiness')
  const { createOpenkododProfileStateStartup } =
    await import('../openkodod/profile-state/openkodod-profile-state-startup')
  const { daemonOwnsFreshPersistentPtys } =
    await import('../daemon/providers/lifecycle/daemon-provider-state')
  const { resolveDaemonSessionScrollbackRows } =
    await import('../daemon/sessions/daemon-session-scrollback-window')
  const { collectOpenkododHealth } = await import('../openkodod/diagnostics/openkodod-health')
  const { agentHookServer } = await import('../agent-hooks/server/agent-hook-server')
  await import('../agent-hooks/installation/managed-agent-hook-controls')
  const { agentHookRuntimeDeps } = await import('../agent-hooks/runtime/agent-hook-runtime-deps')
  const { installHookStatusSessionTabsRepublish } =
    await import('../agent-hooks/runtime/hook-status-session-tabs-republish')
  const {
    startOpenkododAgentHookServer,
    startOpenkododManagedAgentHooks,
    stopOpenkododAgentListeners
  } = await import('../openkodod/host-runtime/openkodod-managed-agent-hooks')
  const { AgentStatusObservedPaneIdentities, AgentStatusObservedPaneIdentityCapture } =
    await import('../runtime/terminal/identity/agent-status-observed-pane-identity')

  const { disposeWatcherProcessAndWait } =
    await import('../ipc/filesystem/watcher-process/parcel-watcher-process')

  let uninstallHookStatusRepublish = (): void => {}
  let uninstallObservedStatusIdentity = (): void => {}
  // Cleanups run in reverse: RPC, then recovery and watchers, then the final flush; the daemon
  // disconnect, registered above, runs last.
  registerCleanup(() => stopOpenkododAgentListeners(agentHookServer))
  registerCleanup(() => uninstallHookStatusRepublish())
  registerCleanup(() => uninstallObservedStatusIdentity())
  registerCleanup(profileShutdown.finalize)
  registerCleanup(stopOpenkododStructuredAgentSessions)
  registerCleanup(() => disposeWatcherProcessAndWait())
  const { startOpenkododDesktopPushService } =
    await import('../openkodod/host-runtime/openkodod-desktop-push')

  const runtimeUserDataPath = getAppEnvironment().getPath('userData')
  const { startEventLoopDelayProbe } = await import('../diagnostics/event-loop-delay-probe')
  startEventLoopDelayProbe('openkodod', runtimeUserDataPath)
  await timed('cli-launcher', () => host.prepareCliLauncher()).catch((error: unknown) => {
    console.warn('[openkodod] Could not prepare the profile CLI launcher', error)
  })
  const idleExitStartup = beginOpenkododIdleExit(runtimeUserDataPath)
  const { applyOpenkododSessionScannerIdleTimeout } =
    await import('../openkodod/host-runtime/openkodod-session-scanner-idle')
  await applyOpenkododSessionScannerIdleTimeout()
  // Initialize sealing before Store load unseals protected settings.
  await timed('secret-store', () => host.prepareSecrets(runtimeUserDataPath))
  const { store: profileStore, authority: profileStateAuthority } = await timed('profile', () =>
    createOpenkododProfileStateStartup(runtimeUserDataPath)
  )
  profileShutdown.store = profileStore
  const { installOpenkododUsageService } =
    await import('../openkodod/host-runtime/openkodod-usage-service')
  const usageClients = installOpenkododUsageService(
    profileStore,
    runtimeUserDataPath,
    registerCleanup
  )
  registerCleanup(() => worktreeRemovalLifetime.close())
  await timed('worktree-removals', () => prepareWorktreeRemovalsForStore(profileStore))
  const observedPaneIdentities = new AgentStatusObservedPaneIdentities()
  const observedStatusCapture = new AgentStatusObservedPaneIdentityCapture(observedPaneIdentities)
  uninstallObservedStatusIdentity = agentHookServer.subscribeEnrichedStatus((enriched) =>
    observedStatusCapture.observe(enriched)
  )
  // Subscribe before hooks start so early turns are counted.
  const { startOpenkododStats } = await import('../openkodod/host-runtime/openkodod-stats')
  const stats = startOpenkododStats(runtimeUserDataPath, agentHookServer, registerCleanup)
  await startOpenkododAgentHookServer(agentHookServer, {
    env: 'production',
    userDataPath: runtimeUserDataPath,
    statusHooksEnabled: isAgentStatusHooksEnabled(profileStore.getSettings())
  })

  // Reconcile, daemon and runtime all consume this environment.
  await timed('login-env-wait', () => loginEnvironment)
  const managedAgentHooks = startOpenkododManagedAgentHooks(
    profileStore,
    (enabled) => agentHookServer.setStatusHooksEnabled(enabled),
    registerCleanup
  )

  // Boots the chat writer during the daemon wait, after login env; restoration consumes this attempt.
  const chatJournal = await startOpenkododAgentSessionRecordStoreOpen(profileStore)

  // Install the daemon provider before PTY handlers can route their first call.
  await daemonStartup

  // Runtime constructor callbacks use this index only after it is installed.
  let sessionSearch: { apply(settings: AiVaultSearchSettings): void; dispose(): void } | null = null

  const { openkododCodexAccountHomes } =
    await import('../openkodod/account-launch/openkodod-codex-account-homes')
  const codexAccountHomes = openkododCodexAccountHomes(
    () => profileStore.getSettings(),
    registerCleanup
  )

  // Gates open where each phase finishes today; RPC starts after all of them.
  const featureReadiness = installOpenkododFeatureReadiness()
  const { createOpenkododAccountServices } =
    await import('../openkodod/account-launch/openkodod-account-services')
  const accountLaunch = createOpenkododAccountServices({
    store: profileStore,
    setClaudeStatusLineListener: (listener) =>
      agentHookServer.setClaudeStatusLineListener(listener),
    registerCleanup,
    clientCodexHomes: codexAccountHomes
  })

  const { loadAgentSessionClaimSigner } =
    await import('../runtime/agent-session/ownership/agent-session-claim-identity')
  const { createOpenkododPairedEnvironmentOptions } =
    await import('../openkodod/host-runtime/openkodod-paired-environment-options')
  const pairedEnvironments = createOpenkododPairedEnvironmentOptions()
  const runtime = new OpenKodoRuntimeService(profileStore, stats, {
    legacyStructuredSessionTabIds: chatJournal.open.legacySessionTabIds,
    // Persistent signatures let restarted runtimes adopt PTYs owned before restart.
    agentSessionClaimSigner: loadAgentSessionClaimSigner(runtimeUserDataPath, runtimeUserDataPath),
    getAdditionalAiVaultCodexHomePaths: () => [
      ...codexAccountHomes.listSessionHomes(),
      ...(accountLaunch?.listCodexSessionHomes() ?? [])
    ],
    // WSL must retain desktop-pushed CODEX_HOME instead of host-selected resolvers.
    ...accountLaunch?.runtimeDeps,
    ...agentHookRuntimeDeps(agentHookServer, observedPaneIdentities, () =>
      profileStore.getSettings()
    ),
    // Resolve lazily because daemon swaps replace the provider after construction.
    getLocalProvider: () => getLocalPtyProvider(),
    ...pairedEnvironments.runtimeOptions,
    // Read current daemon ownership; failed/degraded launch cannot claim fresh PTY persistence.
    canRecoverPersistentLocalPtys: () => daemonOwnsFreshPersistentPtys(),
    // Node hosts cannot promote into desktop windows; override the constructor’s openable default.
    getDesktopWindowStatus: () => 'blocked',
    // No renderer reveals from this model; it keeps the daemon's live window, which deeper snapshot reads ask first.
    headlessTerminalScrollbackRows: resolveDaemonSessionScrollbackRows(),
    // Unchanged settings would reconstruct a healthy search index; deduplicate before apply.
    applySessionSearchSettings: (before, after) => {
      const next = changedAiVaultSearchSettings(before, after)
      if (next) {
        sessionSearch?.apply(next)
      }
    }
  })
  profileShutdown.paneGrids = runtime
  profileShutdown.paintLedger = runtime
  runtime.beginStructuredAgentSessionStartupOpen(chatJournal.maintenanceAfter, chatJournal.open)
  // Agent detection answers RPC before release reclaim below, and must count OpenKodo's copies then too.
  const { provideManagedAgentDetection } =
    await import('../runtime/rpc/methods/host-management/managed-copy-detection')
  provideManagedAgentDetection(runtime)

  const { installFirstWorkRenameHookSubscription } =
    await import('../agent-hooks/first-work/first-work-rename-hook-subscription')
  const { firstWorkRenameDeps } =
    await import('../agent-hooks/first-work/first-work-rename-runtime')
  registerCleanup(
    installFirstWorkRenameHookSubscription(firstWorkRenameDeps(profileStore, runtime))
  )
  const { installAgentTurnWorktreeActivity } =
    await import('../agent-hooks/runtime/agent-turn-worktree-activity')
  registerCleanup(installAgentTurnWorktreeActivity())

  accountLaunch?.attachToRuntime(runtime)
  const { wireGitHubIssueLinkTitleFill } =
    await import('../github/workspace-links/github-issue-link-title-wiring')
  registerCleanup(wireGitHubIssueLinkTitleFill(profileStore, runtime))
  const { installOpenkododEmulatorBridge } =
    await import('../openkodod/host-runtime/openkodod-emulator-bridge')
  installOpenkododEmulatorBridge(runtime, registerCleanup)
  const relay = await installOpenkododRelayAndAccount(runtime, registerCleanup)
  // Agents here set Google up through a paired desktop's browser; their key and secret stay here.
  const { installGoogleSetupHostWatch } = await import('../google/google-setup-host-watch')
  registerCleanup(installGoogleSetupHostWatch(runtime))

  // Restore prior desktop-pushed account selection before automations or CLI launches.
  const { restoreOpenkododHostAccountLaunchEnv } =
    await import('../openkodod/account-launch/openkodod-host-account-launch-env-store')
  restoreOpenkododHostAccountLaunchEnv(runtime, runtimeUserDataPath)
  featureReadiness.open('accounts')

  const { installOpenkododSessionSearchService } =
    await import('../openkodod/host-runtime/openkodod-session-search')
  const { sessionSearchScopeCatalogFromStore } =
    await import('../ai-vault-search/scope/session-search-store-scope-catalog')
  sessionSearch = await installOpenkododSessionSearchService({
    userDataPath: runtimeUserDataPath,
    getSettings: () => profileStore.getSettings(),
    // Workspace/Project scopes resolve through this host's own registrations, read per search.
    getScopeCatalog: () => sessionSearchScopeCatalogFromStore(profileStore, LOCAL_EXECUTION_HOST_ID)
  })
  getAppEnvironment().onWillQuit(() => sessionSearch?.dispose())
  featureReadiness.open('sessionSearch')

  const { startAgentStateRulesLiveUpdates } =
    await import('../runtime/agent-state-rules/agent-state-rules-live-update')
  startAgentStateRulesLiveUpdates(profileStore, (rules) =>
    console.info(`[openkodod] agent state rules ${rules.version} (${rules.source})`)
  )
  // Paired phones dictate through this host; keep its model loaded the same way the desktop does.
  const { startSpeechModelWarmup } = await import('../speech/speech-model-warmup')
  startSpeechModelWarmup(profileStore)
  if (OPENKODO_LAYOUT_OWNER_IS_MAIN) {
    const { repairDuplicatePtyPanesOnStart } =
      await import('../runtime/terminal/identity/moved-pane-owner-rekey')
    // Wait behind earlier writes and persist repair before reconciliation/RPC admission.
    await repairDuplicatePtyPanesOnStart(profileStore, runtime)
  }

  // Status changes must republish session.tabs to paired clients.
  uninstallHookStatusRepublish = installHookStatusSessionTabsRepublish(
    agentHookServer,
    () => runtime
  )
  registerCleanup(runtime.attachAgentStatusStore(agentHookServer))

  // Headless registration threads Store into persistence; account homes prefer client then host selection.
  // WSL has no host selection and keeps the desktop-prepared environment.
  await registerHeadlessPtyRuntime(
    runtime,
    async (target, launchEnv, context) =>
      (await codexAccountHomes.selectLaunchHome(target, launchEnv, context)) ??
      (accountLaunch ? accountLaunch.prepareCodexHome(target, launchEnv, context) : null),
    () => profileStore.getSettings(),
    accountLaunch?.prepareClaudeAuth,
    profileStore,
    accountLaunch?.prepareCodexSessionResume
  )

  // Recover browser/orchestration authority before clients attach to the runtime graph.
  runtime.rehydrateClientHostedBrowserPages()

  await restoreOpenkododTerminalAuthority(runtime, timed, featureReadiness)
  runtime.agentTransitions.seedRestoredRows()
  void runtime.sidebarFacts?.reconcileSortStampTiers(getLocalPtyProvider())

  // Run after RPC stops; later dismissal records save synchronously until exit.
  registerCleanup(() => runtime.closeNotificationDismissals())
  // Stop recovery retries before final profile flush.
  registerCleanup(() => runtime.stopLegacyWorkerTerminalRecovery())

  // Recovery establishes terminal/dispatch identities before fencing observations.
  observedStatusCapture.attach(runtime)
  agentHookServer.setCliWriterExecutionMatcher(observedPaneIdentities, runtime)
  agentHookServer.setClaudePermissionHolds(runtime.terminalWorkerApprovals)
  // First RPC clients must see a fully published graph.
  const { publishHeadlessRuntimeGraph } =
    await import('../runtime/session-graph/headless-runtime-graph')
  publishHeadlessRuntimeGraph(runtime)
  // Only the runtime can identify running shells and install deferred migrated history.
  void runtime.installPendingOpenkododMigrationShellHistory().catch((error: unknown) => {
    console.error('[openkodod-migration] installing pending shell history failed:', error)
  })

  const connector = await installOpenkododConnectorHost(runtime, profileStore, registerCleanup)

  const bindHost = resolveOpenkododBindHost(options.bind)
  bindOpenkododStopTerminalAdmission(runtime.terminalUpdateAdmission)
  const rpc = createOpenkododRuntimeRpcServer(runtime, runtimeUserDataPath, options, bindHost)
  pairedEnvironments.bindRpc(rpc)
  runtime.setAgentSenderPeerKey(() => rpc.getE2EEPublicKey())
  // Stop RPC before cleanup can tear down writers and runtime state.
  registerCleanup(() => rpc.stop())
  await timed('rpc', () => rpc.start())
  worktreeRemovalLifetime.resume(() => runtime.finishInterruptedWorktreeRemovals())
  startOpenkododSchedulers(runtime, profileStore, usageClients, registerCleanup)
  connector.connect()
  relay.start(rpc)
  startOpenkododDesktopPushService(runtime, rpc)
  console.error(`[openkodod] ${describeOpenkododBindExposure(bindHost)}`)

  const readiness = await buildOpenkododServeReadiness({
    options,
    runtimeId: runtime.getRuntimeId(),
    rpc,
    collectHealth: () =>
      collectOpenkododHealth(
        getAppEnvironment().getVersion(),
        profileStateAuthority,
        idleExitStartup.previousIdleStop
      )
  })

  await new ServeReadinessPublisher().publish(readiness, servePublishMode(options))
  // Background chat-journal maintenance, CI-line watches and runtime release reclaim start once this host is serving.
  chatJournal.serving(runtime)
  const { reclaimManagedRuntimeReleasesAtLaunch, startManagedRuntimeAutoUpdates } =
    await import('../runtime/rpc/methods/host-management/managed-runtime-install')
  reclaimManagedRuntimeReleasesAtLaunch(runtime)
  startManagedRuntimeAutoUpdates()
  reportStartupTiming()
  managedAgentHooks.readinessPublished()

  await idleExitStartup.start({
    rpc,
    agentStates: () => agentHookServer.getStatusSnapshot(),
    hasStagedMigration: () => profileStore.hasStagedOpenkododMigrationCatalog(),
    automationsBusy: () => openkododSchedulersKeepHostBusy(runtime, profileStore),
    emulatorsBusy: async () =>
      (await runtime.getEmulatorBridge()?.hasLiveManagedSessions()) ?? false,
    registerCleanup
  })
  return { readiness }
}
