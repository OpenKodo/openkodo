import {
  OpenkododCrashLoopError,
  wakeManagedOpenkododUnlessCrashLooping
} from './openkodod-managed-crash-loop'
import { wakeStoppedManagedOpenkodod } from './openkodod-managed-wake'
import type { OpenkododSlotOptions } from '../activation/openkodod-recovery-slot'

/** Already-active deploys launch nothing; wake that slot only on proven exit, including after reboot. Return whether it was started. */
export async function wakeAlreadyActiveOpenkodod(
  options: OpenkododSlotOptions,
  /** SSH-managed hosts share the crash-loop brake with every other automatic wake. */
  managed?: { environmentId: string; hostLabel: string }
): Promise<boolean> {
  const wake = managed
    ? await wakeManagedOpenkododUnlessCrashLooping(
        managed.environmentId,
        managed.hostLabel,
        options
      )
    : await wakeStoppedManagedOpenkodod(options)
  if (wake.outcome === 'crash-loop') {
    throw new OpenkododCrashLoopError(wake.detail)
  }
  if (wake.outcome === 'recovery-refused') {
    throw new Error(wake.reason)
  }
  return wake.outcome === 'started'
}
