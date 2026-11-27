import { errorMessage } from '../../../shared/errors/error-message'
import {
  OpenkododPreflightUnansweredError,
  preflightInstalledOpenkodod
} from '../install/openkodod-remote-preflight'

type OpenkododCandidatePreflightFailure = {
  // A failed preflight is remembered as host incompatibility; an unanswered one is retried next connect.
  code: 'openkodod_candidate_preflight_failed' | 'openkodod_candidate_preflight_unanswered'
  failure: string
}

/** Preflight before any stop; asked to, the candidate also names the daemon generations under the served data root. */
export async function preflightOpenkododCandidate(
  options: Omit<Parameters<typeof preflightInstalledOpenkodod>[0], 'probeDaemonsUnder'> & {
    userDataDir: string
  },
  probeDaemons: boolean
): Promise<
  { hostDaemonProtocols: readonly number[] | undefined } | OpenkododCandidatePreflightFailure
> {
  try {
    const answer = await preflightInstalledOpenkodod({
      ...options,
      ...(probeDaemons ? { probeDaemonsUnder: options.userDataDir } : {})
    })
    return { hostDaemonProtocols: answer.liveDaemonProtocols ?? undefined }
  } catch (error) {
    options.signal?.throwIfAborted()
    return {
      code:
        error instanceof OpenkododPreflightUnansweredError
          ? 'openkodod_candidate_preflight_unanswered'
          : 'openkodod_candidate_preflight_failed',
      failure: `Candidate profile preflight failed; the incumbent was not stopped: ${errorMessage(error)}`
    }
  }
}
