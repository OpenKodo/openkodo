import type { OpenKodoRuntimeService } from '../../runtime/openkodo-runtime'
import type { WorkspaceCleanupRunner } from './workspace-cleanup-runner'

// Keyed by runtime: desktop main and openkodod each own one runner for their own repos.
const runners = new WeakMap<OpenKodoRuntimeService, WorkspaceCleanupRunner>()

export function setWorkspaceCleanupRunner(
  runtime: OpenKodoRuntimeService,
  runner: WorkspaceCleanupRunner
): void {
  runners.set(runtime, runner)
}

export function getWorkspaceCleanupRunner(
  runtime: OpenKodoRuntimeService
): WorkspaceCleanupRunner | undefined {
  return runners.get(runtime)
}

export function requireWorkspaceCleanupRunner(
  runtime: OpenKodoRuntimeService
): WorkspaceCleanupRunner {
  const runner = runners.get(runtime)
  if (!runner) {
    throw new Error('Workspace cleanup is not running on this host.')
  }
  return runner
}
