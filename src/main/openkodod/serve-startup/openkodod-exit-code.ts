import { OpenkododBindAddressError } from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-bind-address'
import { OpenkododBundledRuntimeError } from '../runtime-launch/openkodod-bundled-runtime'
import { OpenkododInstanceLockError } from '../instance-lock/openkodod-data-root-privacy'
import { ProfileStateAccessError } from '../../persistence/profile-state/access/profile-state-access-error'
import { OPENKODOD_EXIT_CONFIGURATION } from './openkodod-configuration-exit'
import { SINGLE_INSTANCE_ALREADY_RUNNING_EXIT_CODE } from '../../../shared/app-lifecycle/launch/single-instance-exit-code'
import { OPENKODOD_EXIT_TERMINALS_NOT_DURABLE } from '../../../shared/remote-runtime/serve-supervisor/serve-supervised-terminal-durability'
import { OpenkododTerminalsNotDurableError } from './openkodod-serve-supervision'

export const OPENKODOD_EXIT_FAILED = 1

export function resolveOpenkododExitCode(error: unknown): number {
  // Supervisors wait for an existing holder instead of abandoning the host.
  if (
    error instanceof OpenkododInstanceLockError &&
    error.code === 'openkodod_instance_lock_holder_unverifiable'
  ) {
    return SINGLE_INSTANCE_ALREADY_RUNNING_EXIT_CODE
  }
  if (error instanceof OpenkododTerminalsNotDurableError) {
    return OPENKODOD_EXIT_TERMINALS_NOT_DURABLE
  }
  return error instanceof OpenkododInstanceLockError ||
    error instanceof OpenkododBindAddressError ||
    error instanceof OpenkododBundledRuntimeError ||
    error instanceof ProfileStateAccessError
    ? OPENKODOD_EXIT_CONFIGURATION
    : OPENKODOD_EXIT_FAILED
}
