/** Desktop main publishes managed-server actions for runtime RPC; headless hosts without a registry advertise none. */
import type {
  OpenkododManagedPastLiveTerminals,
  OpenkododManagedCancelStopResult,
  OpenkododManagedDeployResult,
  OpenkododManagedForgetResult,
  OpenkododManagedRecoveryResult,
  OpenkododManagedRollbackResult,
  OpenkododManagedRuntimeStatus,
  OpenkododManagedStopResult
} from '../../../../shared/remote-runtime/openkodod-lifecycle/openkodod-managed-runtime'

export type ManagedServerActions = {
  status: (selector: string) => Promise<OpenkododManagedRuntimeStatus>
  update: (
    selector: string,
    force: boolean,
    pastLiveTerminals?: OpenkododManagedPastLiveTerminals,
    /** With force, accepts that terminals openkodod runs itself end when the census cannot count them. */
    endInProcessTerminals?: boolean
  ) => Promise<OpenkododManagedDeployResult>
  rollback: (selector: string) => Promise<OpenkododManagedRollbackResult>
  /** `acceptChangedState` restores the snapshot over state a rejected build changed. */
  recover: (
    selector: string,
    acceptChangedState?: boolean
  ) => Promise<OpenkododManagedRecoveryResult>
  stop: (selector: string) => Promise<OpenkododManagedStopResult>
  cancelStop: (selector: string) => Promise<OpenkododManagedCancelStopResult>
  forget: (selector: string) => Promise<OpenkododManagedForgetResult>
  /** Forget only while another saved entry still manages the same server. */
  forgetRedundant: (selector: string) => Promise<OpenkododManagedForgetResult>
}

let registered: ManagedServerActions | null = null

export function registerManagedServerActions(actions: ManagedServerActions | null): void {
  registered = actions
}

export function getManagedServerActions(): ManagedServerActions | null {
  return registered
}
