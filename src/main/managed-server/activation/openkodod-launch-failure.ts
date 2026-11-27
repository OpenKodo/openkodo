import { OpenkododWindowsLaunchFailedError } from '../install/openkodod-remote-launch-windows'
import { OpenkododLaunchReadinessError } from './openkodod-active-readiness'

/** A launch that ended a run: it never became ready, or the host reported it could not start. */
export function isOpenkododLaunchFailure(error: unknown): error is Error {
  return (
    error instanceof OpenkododLaunchReadinessError ||
    error instanceof OpenkododWindowsLaunchFailedError
  )
}

/** Only a readiness failure had a running openkodod, whose death the next openkodod will report. */
export function openkododLaunchFailureRanProcess(error: Error): boolean {
  return error instanceof OpenkododLaunchReadinessError
}
