import { access, readdir, rm, rmdir } from 'node:fs/promises'
import { join } from 'node:path'
import {
  getAgentHookConfigPaths,
  type AgentHookInstallStatus
} from '../../shared/agent-hook-listener/configuration/agent-hook-types'
import { isManagedAgentHookTarget } from '../../shared/agent-hook-listener/configuration/managed-agent-hook-targets'
import type { CliInstallStatus } from '../../shared/cli/cli-install-types'
import type { ServeServiceRun } from '../../shared/remote-runtime/serve-supervisor/serve-service-unit-removal'
import type {
  OpenKodoUninstallAgentEntry,
  OpenKodoUninstallHostEntry,
  OpenKodoUninstallPlan,
  OpenKodoUninstallSimpleEntry,
  OpenKodoUninstallStep
} from '../../shared/uninstall/openkodo-uninstall-types'
import {
  getManagedAgentHookStatuses,
  removeManagedAgentHooks
} from '../agent-hooks/installation/managed-agent-hook-controls'
import {
  findPluginHookFiles,
  removePluginHookFiles,
  type PluginHookRemoval
} from '../agent-hooks/installation/opencode-pi-plugin-hook-files'
import type { OpenKodoInstallIdentity } from './openkodo-install-identity'
import { forgetClaudeAgentViewMarkers } from '../claude/agent-view/agent-view-uninstall'
import { collapseHomePath } from '../../shared/skills/bundled/bundled-skill-locations'
import { describeOpenKodoUninstallPath } from './openkodo-uninstall-path-display'
import {
  runBackgroundService,
  runTerminalDaemon,
  serviceEntry,
  terminalDaemonEntry
} from './openkodo-uninstall-background-processes'
import { openkodoUninstallErrorText as errorText } from './openkodo-uninstall-error-text'

/** What the desktop app supplies to the cleanup. */
export type OpenKodoUninstallHost = {
  platform: NodeJS.Platform
  homeDir: string
  userDataPath: string
  uid: number
  identity: OpenKodoInstallIdentity
  /** Persists `agentStatusHooksEnabled: false`, so startup reconciliation cannot reinstall. */
  disableAgentStatusHooks: () => Promise<void>
  /** Null when this host cannot read the `openkodo` command registration. */
  getCliStatus: () => Promise<CliInstallStatus | null>
  removeCli: () => Promise<CliInstallStatus>
  listHosts: () => Promise<OpenKodoUninstallHostEntry[]>
  removeHostHooks: (hostId: string) => Promise<void>
  runServiceManager?: ServeServiceRun
  isTerminalDaemonLive: () => Promise<boolean>
  /** Ends the daemon and every terminal it runs; throws if one is still running. */
  stopTerminalDaemon: () => Promise<void>
}

const PLUGIN_AGENTS: ReadonlySet<string> = new Set(['opencode', 'pi', 'omp', 'prime-agent'])

function isOpenKodoOwnedCli(status: CliInstallStatus | null): status is CliInstallStatus {
  return status !== null && (status.state === 'installed' || status.state === 'stale')
}

/** Read-only: lists what OpenKodo added outside its own folders. */
export async function buildOpenKodoUninstallPlan(
  host: OpenKodoUninstallHost
): Promise<OpenKodoUninstallPlan> {
  const registryAgents: OpenKodoUninstallAgentEntry[] = getManagedAgentHookStatuses()
    .filter((status) => status.managedHooksPresent)
    .map((status) => ({
      agent: status.agent,
      paths: getAgentHookConfigPaths(status).map((path) =>
        describeOpenKodoUninstallPath(path, host)
      ),
      state: 'present',
      detail: null
    }))
  const pluginAgents: OpenKodoUninstallAgentEntry[] = (
    await findPluginHookFiles({ homeDir: host.homeDir })
  ).map((entry) => ({
    ...entry,
    paths: entry.paths.map((path) => describeOpenKodoUninstallPath(path, host)),
    state: 'present',
    detail: null
  }))
  const cli = await host.getCliStatus().catch(() => null)
  const scripts = join(host.homeDir, '.openkodo', 'agent-hooks')
  const scriptsMissing = await access(scripts).catch(() => true)
  return {
    installKind: host.identity.installKind,
    agents: [...registryAgents, ...pluginAgents],
    cliCommand: isOpenKodoOwnedCli(cli)
      ? {
          commandName: cli.commandName,
          location: cli.commandPath
            ? collapseHomePath(cli.commandPath, host.homeDir)
            : cli.commandName,
          state: 'present',
          detail: null
        }
      : null,
    backgroundService: await serviceEntry(host),
    hookScripts: !scriptsMissing
      ? { location: collapseHomePath(scripts, host.homeDir), state: 'present', detail: null }
      : null,
    hosts: await host.listHosts(),
    terminalDaemon: await terminalDaemonEntry(host),
    otherOpenKodoBuildName: host.identity.otherOpenKodoBuildName,
    appPath: host.identity.appPath,
    removeAppCommand: host.identity.removeAppCommand
  }
}

function isPending(
  entry: { state: string },
  only: ReadonlySet<string> | null,
  id: string
): boolean {
  return entry.state !== 'removed' && (only === null || only.has(id))
}

function registryOutcome(
  status: AgentHookInstallStatus | undefined
): Pick<OpenKodoUninstallAgentEntry, 'state' | 'detail'> {
  if (!status) {
    return { state: 'removed', detail: null }
  }
  if (status.state === 'error' || status.managedHooksPresent) {
    return { state: 'error', detail: status.detail ?? 'OpenKodo hooks are still in this file.' }
  }
  return { state: 'removed', detail: null }
}

async function runAgentHooks(
  plan: OpenKodoUninstallPlan,
  host: OpenKodoUninstallHost,
  only: ReadonlySet<string> | null
): Promise<OpenKodoUninstallAgentEntry[]> {
  const pending = plan.agents.filter((entry) => isPending(entry, only, entry.agent))
  if (pending.length === 0) {
    return plan.agents
  }
  const update = (
    outcome: (
      entry: OpenKodoUninstallAgentEntry
    ) => Pick<OpenKodoUninstallAgentEntry, 'state' | 'detail'>
  ): OpenKodoUninstallAgentEntry[] =>
    plan.agents.map((entry) => (pending.includes(entry) ? { ...entry, ...outcome(entry) } : entry))
  const otherBuild = plan.otherOpenKodoBuildName
  if (otherBuild) {
    return update(() => ({ state: 'kept-shared', detail: `${otherBuild} still uses these hooks.` }))
  }
  try {
    await host.disableAgentStatusHooks()
  } catch (error) {
    const detail = `Could not turn off agent status hooks: ${errorText(error)}`
    return update(() => ({ state: 'error', detail }))
  }
  const pluginRemovals = new Map<string, PluginHookRemoval>(
    (
      await removePluginHookFiles({
        homeDir: host.homeDir,
        agents: pending.map((entry) => entry.agent)
      })
    ).map((removal) => [removal.agent, removal])
  )
  const registryAgents = pending.map((entry) => entry.agent).filter(isManagedAgentHookTarget)
  const statuses = new Map<string, AgentHookInstallStatus>(
    registryAgents.length === 0
      ? []
      : (await removeManagedAgentHooks({ agents: registryAgents })).map((status) => [
          status.agent,
          status
        ])
  )
  const claude = statuses.get('claude')
  if (claude && registryOutcome(claude).state === 'removed') {
    await forgetClaudeAgentViewMarkers().catch(() => {})
  }
  return update((entry) => {
    const plugin = pluginRemovals.get(entry.agent)
    if (plugin) {
      return plugin.error
        ? { state: 'error', detail: plugin.error }
        : { state: 'removed', detail: null }
    }
    return PLUGIN_AGENTS.has(entry.agent)
      ? { state: 'removed', detail: null }
      : registryOutcome(statuses.get(entry.agent))
  })
}

async function runCliCommand(
  plan: OpenKodoUninstallPlan,
  host: OpenKodoUninstallHost
): Promise<OpenKodoUninstallPlan['cliCommand']> {
  const entry = plan.cliCommand
  if (!entry || entry.state === 'removed') {
    return entry
  }
  try {
    const status = await host.removeCli()
    return isOpenKodoOwnedCli(status)
      ? { ...entry, state: 'error', detail: status.detail ?? 'The command is still registered.' }
      : { ...entry, state: 'removed', detail: null }
  } catch (error) {
    return { ...entry, state: 'error', detail: errorText(error) }
  }
}

async function runHookScripts(
  plan: OpenKodoUninstallPlan,
  host: OpenKodoUninstallHost
): Promise<OpenKodoUninstallSimpleEntry | null> {
  const entry = plan.hookScripts
  if (!entry || entry.state === 'removed') {
    return entry
  }
  if (plan.otherOpenKodoBuildName) {
    return {
      ...entry,
      state: 'kept-shared',
      detail: `${plan.otherOpenKodoBuildName} still uses them.`
    }
  }
  // Hook entries left in an agent's config still call these scripts on every event.
  const stillHooked = plan.agents.filter(
    (agent) => agent.state !== 'removed' && !PLUGIN_AGENTS.has(agent.agent)
  )
  if (stillHooked.length > 0) {
    const names = stillHooked.map((agent) => agent.agent).join(', ')
    return { ...entry, state: 'kept-shared', detail: `Still used by ${names}.` }
  }
  try {
    const dir = join(host.homeDir, '.openkodo', 'agent-hooks')
    await rm(dir, { recursive: true, force: true })
    const openkodoDir = join(host.homeDir, '.openkodo')
    if ((await readdir(openkodoDir).catch(() => ['?'])).length === 0) {
      await rmdir(openkodoDir)
    }
    return { ...entry, state: 'removed', detail: null }
  } catch (error) {
    return { ...entry, state: 'error', detail: errorText(error) }
  }
}

async function runSshHosts(
  plan: OpenKodoUninstallPlan,
  host: OpenKodoUninstallHost,
  only: ReadonlySet<string> | null
): Promise<OpenKodoUninstallHostEntry[]> {
  const results: OpenKodoUninstallHostEntry[] = []
  for (const entry of plan.hosts) {
    if (!isPending(entry, only, entry.hostId)) {
      results.push(entry)
      continue
    }
    // A Retry targets the host, so try it even if it was offline when the plan was built.
    if (!entry.connected && only === null) {
      results.push({ ...entry, state: 'needs-user', detail: 'Not connected.' })
      continue
    }
    try {
      await host.removeHostHooks(entry.hostId)
      results.push({ ...entry, connected: true, state: 'removed', detail: null })
    } catch (error) {
      results.push({
        ...entry,
        state: entry.connected ? 'error' : 'needs-user',
        detail: errorText(error)
      })
    }
  }
  return results
}

/** Runs one step and returns the whole plan with that step's entries updated. */
export async function runOpenKodoUninstallStep(
  plan: OpenKodoUninstallPlan,
  step: OpenKodoUninstallStep,
  host: OpenKodoUninstallHost,
  only?: readonly string[]
): Promise<OpenKodoUninstallPlan> {
  const filter = only && only.length > 0 ? new Set(only) : null
  switch (step) {
    case 'agent-hooks':
      return { ...plan, agents: await runAgentHooks(plan, host, filter) }
    case 'cli-command':
      return { ...plan, cliCommand: await runCliCommand(plan, host) }
    case 'background-service':
      return { ...plan, backgroundService: await runBackgroundService(plan, host) }
    case 'hook-scripts':
      return { ...plan, hookScripts: await runHookScripts(plan, host) }
    case 'ssh-hosts':
      return { ...plan, hosts: await runSshHosts(plan, host, filter) }
    case 'terminal-daemon':
      return { ...plan, terminalDaemon: await runTerminalDaemon(plan, host) }
  }
}
