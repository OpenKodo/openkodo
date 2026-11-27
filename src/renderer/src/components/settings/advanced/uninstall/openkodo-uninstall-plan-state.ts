import {
  OPENKODO_UNINSTALL_STEPS,
  type OpenKodoUninstallAgentEntry,
  type OpenKodoUninstallEntryState,
  type OpenKodoUninstallHostEntry,
  type OpenKodoUninstallPlan,
  type OpenKodoUninstallRunStepArgs,
  type OpenKodoUninstallStep
} from '../../../../../../shared/uninstall/openkodo-uninstall-types'

export function isOpenKodoUninstallProblem(state: OpenKodoUninstallEntryState): boolean {
  return state === 'error' || state === 'needs-user'
}

export function getOpenKodoUninstallStepStates(
  plan: OpenKodoUninstallPlan,
  step: OpenKodoUninstallStep
): OpenKodoUninstallEntryState[] {
  switch (step) {
    case 'agent-hooks':
      return plan.agents.map((entry) => entry.state)
    case 'cli-command':
      return plan.cliCommand ? [plan.cliCommand.state] : []
    case 'background-service':
      return plan.backgroundService ? [plan.backgroundService.state] : []
    case 'hook-scripts':
      return plan.hookScripts ? [plan.hookScripts.state] : []
    case 'ssh-hosts':
      return plan.hosts.map((entry) => entry.state)
    case 'terminal-daemon':
      return plan.terminalDaemon ? [plan.terminalDaemon.state] : []
  }
}

export function countOpenKodoUninstallProblems(plan: OpenKodoUninstallPlan): number {
  return OPENKODO_UNINSTALL_STEPS.flatMap((step) =>
    getOpenKodoUninstallStepStates(plan, step)
  ).filter(isOpenKodoUninstallProblem).length
}

/** Kept for a reason that can still clear (an agent that failed), not because another OpenKodo build uses it. */
export function countOpenKodoUninstallPendingKept(plan: OpenKodoUninstallPlan): number {
  if (plan.otherOpenKodoBuildName) {
    return 0
  }
  return OPENKODO_UNINSTALL_STEPS.flatMap((step) =>
    getOpenKodoUninstallStepStates(plan, step)
  ).filter((state) => state === 'kept-shared').length
}

/** The scripts stay while any agent still runs them; once a retry clears the last agent they can go. */
export function shouldRemoveHookScriptsAfterAgentRetry(plan: OpenKodoUninstallPlan): boolean {
  return (
    plan.otherOpenKodoBuildName === null &&
    plan.hookScripts !== null &&
    plan.hookScripts.state !== 'removed' &&
    plan.agents.every((entry) => entry.state === 'removed' || entry.state === 'kept-shared')
  )
}

// An entry the step ran on but the returned plan no longer lists is gone from disk.
function mergeById<T extends { state: OpenKodoUninstallEntryState }>(
  previous: T[],
  next: T[],
  idOf: (entry: T) => string,
  only: readonly string[] | undefined
): T[] {
  const nextById = new Map(next.map((entry) => [idOf(entry), entry]))
  return previous.map((entry) => {
    const id = idOf(entry)
    if (only && !only.includes(id)) {
      return entry
    }
    return nextById.get(id) ?? { ...entry, state: 'removed' }
  })
}

function mergeSimple<T extends { state: OpenKodoUninstallEntryState }>(
  previous: T | null,
  next: T | null
): T | null {
  if (!previous) {
    return null
  }
  return next ?? { ...previous, state: 'removed' }
}

const agentId = (entry: OpenKodoUninstallAgentEntry): string => entry.agent
const hostId = (entry: OpenKodoUninstallHostEntry): string => entry.hostId

/** Takes only the entries the step ran on, so a backend rescan can't drop rows the user is reading. */
export function mergeOpenKodoUninstallStepResult(
  previous: OpenKodoUninstallPlan,
  next: OpenKodoUninstallPlan,
  { step, only }: OpenKodoUninstallRunStepArgs
): OpenKodoUninstallPlan {
  switch (step) {
    case 'agent-hooks':
      return { ...previous, agents: mergeById(previous.agents, next.agents, agentId, only) }
    case 'cli-command':
      return { ...previous, cliCommand: mergeSimple(previous.cliCommand, next.cliCommand) }
    case 'background-service':
      return {
        ...previous,
        backgroundService: mergeSimple(previous.backgroundService, next.backgroundService)
      }
    case 'hook-scripts':
      return { ...previous, hookScripts: mergeSimple(previous.hookScripts, next.hookScripts) }
    case 'ssh-hosts':
      return { ...previous, hosts: mergeById(previous.hosts, next.hosts, hostId, only) }
    case 'terminal-daemon':
      return {
        ...previous,
        terminalDaemon: mergeSimple(previous.terminalDaemon, next.terminalDaemon)
      }
  }
}

export function markOpenKodoUninstallStepFailed(
  plan: OpenKodoUninstallPlan,
  { step, only }: OpenKodoUninstallRunStepArgs,
  detail: string
): OpenKodoUninstallPlan {
  const fail = <T extends { state: OpenKodoUninstallEntryState; detail: string | null }>(
    entry: T
  ): T => ({ ...entry, state: 'error', detail })
  const failListed = <T extends { state: OpenKodoUninstallEntryState; detail: string | null }>(
    entries: T[],
    idOf: (entry: T) => string
  ): T[] => entries.map((entry) => (only && !only.includes(idOf(entry)) ? entry : fail(entry)))
  switch (step) {
    case 'agent-hooks':
      return { ...plan, agents: failListed(plan.agents, agentId) }
    case 'cli-command':
      return { ...plan, cliCommand: plan.cliCommand && fail(plan.cliCommand) }
    case 'background-service':
      return { ...plan, backgroundService: plan.backgroundService && fail(plan.backgroundService) }
    case 'hook-scripts':
      return { ...plan, hookScripts: plan.hookScripts && fail(plan.hookScripts) }
    case 'ssh-hosts':
      return { ...plan, hosts: failListed(plan.hosts, hostId) }
    case 'terminal-daemon':
      return { ...plan, terminalDaemon: plan.terminalDaemon && fail(plan.terminalDaemon) }
  }
}

/** Runs one step and folds its result into the plan; a thrown step marks its own rows as errors. */
async function runOpenKodoUninstallStep(
  plan: OpenKodoUninstallPlan,
  args: OpenKodoUninstallRunStepArgs,
  runStep: (args: OpenKodoUninstallRunStepArgs) => Promise<OpenKodoUninstallPlan>,
  failureDetail: string
): Promise<OpenKodoUninstallPlan> {
  try {
    return mergeOpenKodoUninstallStepResult(plan, await runStep(args), args)
  } catch (error) {
    console.error(`[uninstall] step ${args.step} failed:`, error)
    return markOpenKodoUninstallStepFailed(plan, args, failureDetail)
  }
}

/** Runs every step the plan has entries for, in order; one failed step doesn't stop the rest. */
export async function runOpenKodoUninstallSteps(
  initial: OpenKodoUninstallPlan,
  runStep: (args: OpenKodoUninstallRunStepArgs) => Promise<OpenKodoUninstallPlan>,
  failureDetail: string,
  onProgress: (plan: OpenKodoUninstallPlan, runningStep: OpenKodoUninstallStep | null) => void
): Promise<OpenKodoUninstallPlan> {
  let plan = initial
  for (const step of OPENKODO_UNINSTALL_STEPS) {
    if (getOpenKodoUninstallStepStates(plan, step).length === 0) {
      continue
    }
    onProgress(plan, step)
    plan = await runOpenKodoUninstallStep(plan, { step }, runStep, failureDetail)
  }
  onProgress(plan, null)
  return plan
}
