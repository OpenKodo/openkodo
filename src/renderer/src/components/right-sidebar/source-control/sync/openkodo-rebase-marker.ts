import type {
  ContinueRebaseResult,
  GitUpstreamStatus,
  RebaseFromBaseResult
} from '../../../../../../shared/git/status/git-status-types'
import type { SourceControlWorktreeOperationState } from '../panel/use-worktree-operation-state'
import type { OpenKodoRebaseMarker } from '../panel/worktree-operation-store'

type OperationStore = SourceControlWorktreeOperationState['operationStore']

/** Main reports the upstream tip only when OpenKodo's own rebase integrated it; nothing else arms the marker. */
export function openkodoRebaseMarkerFromResult(
  branch: string,
  result: RebaseFromBaseResult | ContinueRebaseResult
): OpenKodoRebaseMarker | null {
  return branch && result.integratedUpstreamOid
    ? { branch, upstreamOid: result.integratedUpstreamOid, state: 'done' }
    : null
}

/** Store the stop a Continue/inspect reported, and arm the marker when it finished OpenKodo's rebase. */
export function recordRebaseStopReading(
  operationStore: OperationStore,
  result: ContinueRebaseResult
): void {
  const finishedOpenKodoRebase =
    result.branch &&
    (result.outcome === 'completed' || result.outcome === 'completed_autostash_conflict')
      ? openkodoRebaseMarkerFromResult(result.branch, result)
      : null
  operationStore.setState({
    rebaseStop: result.stop
      ? {
          token: result.stop,
          ...(result.indexObservation ? { indexObservation: result.indexObservation } : {}),
          branch: result.branch ?? null,
          blocked:
            result.outcome === 'empty' || result.outcome === 'stopped' ? result.outcome : null
        }
      : null,
    rebaseStopInspectFailure: null,
    ...(finishedOpenKodoRebase ? { openkodoRebase: finishedOpenKodoRebase } : {})
  })
}

/** Applies only to the same branch, upstream tip and old-copy count, while still diverged. */
export function openkodoRebaseMarkerMatches(
  marker: OpenKodoRebaseMarker,
  branchName: string,
  remoteStatus: GitUpstreamStatus | undefined
): boolean {
  return (
    remoteStatus !== undefined &&
    marker.branch === branchName &&
    remoteStatus.upstreamOid === marker.upstreamOid &&
    remoteStatus.ahead > 0 &&
    remoteStatus.behind > 0 &&
    (marker.behind === undefined || remoteStatus.behind === marker.behind)
  )
}

/** A different upstream tip retires it at once; other mismatches only after a match was seen. */
export function openkodoRebaseMarkerIsRetired(
  marker: OpenKodoRebaseMarker,
  branchName: string,
  remoteStatus: GitUpstreamStatus | undefined
): boolean {
  // A detached HEAD (empty name) can be the paused rebase's reading from before Continue finished,
  // so it retires only a marker whose refreshed match was already seen.
  if (branchName === '') {
    return marker.state === 'active'
  }
  // Another branch retires it before upstream status catches up.
  if (branchName !== marker.branch) {
    return true
  }
  if (remoteStatus === undefined) {
    return false
  }
  if (remoteStatus.upstreamOid !== undefined && remoteStatus.upstreamOid !== marker.upstreamOid) {
    return true
  }
  return marker.state === 'active' && !openkodoRebaseMarkerMatches(marker, branchName, remoteStatus)
}
