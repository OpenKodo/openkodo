import type {
  OpenKodoUninstallFinishAction,
  OpenKodoUninstallPlan,
  OpenKodoUninstallRunStepArgs
} from '../../../shared/uninstall/openkodo-uninstall-types'

export type OpenKodoUninstallApi = {
  /** Read-only: what the cleanup would change on this machine. */
  getPlan: () => Promise<OpenKodoUninstallPlan>
  /** Runs one step and returns the whole plan with that step's entries updated. */
  runStep: (args: OpenKodoUninstallRunStepArgs) => Promise<OpenKodoUninstallPlan>
  finish: (action: OpenKodoUninstallFinishAction) => Promise<void>
}
