import { useEffect } from 'react'
import type { GitUpstreamStatus } from '../../../../../../shared/git/status/git-status-types'
import type { SourceControlWorktreeOperationState } from '../panel/use-worktree-operation-state'
import type { OpenKodoRebaseMarker } from '../panel/worktree-operation-store'
import {
  openkodoRebaseMarkerIsRetired,
  openkodoRebaseMarkerMatches
} from './openkodo-rebase-marker'

/** After OpenKodo's own rebase, hide Pull/Sync/FF/Push while the branch still diverges from the same tip. */
export function useOpenKodoRebaseMarker({
  branchName,
  operationStore,
  openkodoRebase,
  remoteStatus
}: {
  branchName: string
  operationStore: SourceControlWorktreeOperationState['operationStore']
  openkodoRebase: OpenKodoRebaseMarker | null
  remoteStatus: GitUpstreamStatus | undefined
}): boolean {
  const applies =
    openkodoRebase !== null && openkodoRebaseMarkerMatches(openkodoRebase, branchName, remoteStatus)
  const retired =
    openkodoRebase !== null &&
    openkodoRebaseMarkerIsRetired(openkodoRebase, branchName, remoteStatus)
  // Readings right after the rebase are still pre-rebase ones; only a seen match arms mismatch retirement.
  const promote = applies && openkodoRebase?.state === 'done'
  const matchedBehind = remoteStatus?.behind
  useEffect(() => {
    const current = operationStore.getState().openkodoRebase
    if (retired) {
      operationStore.setState({ openkodoRebase: null })
    } else if (promote && current) {
      operationStore.setState({
        openkodoRebase: { ...current, state: 'active', behind: matchedBehind }
      })
    }
  }, [matchedBehind, operationStore, promote, retired])
  return applies && !retired
}
