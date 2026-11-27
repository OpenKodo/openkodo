import { getAutomationRunRepoId } from '../../../../../shared/automations/history/automation-run-identity'
import type { OpenkododMigrationManifest } from '../../../../../shared/openkodod-migration/openkodod-migration-manifest'
import type { PersistedState } from '../../../../../shared/openkodo-profiles/persisted-state-types'
import {
  createOpenkododMigrationSourceScope,
  openkododMigrationOwnsRepoId
} from '../catalog/openkodod-source-scope'

/** Include rows a downgraded build added to moved projects. */
export function subtractOpenkododMigrationSourceAutomationState(
  state: PersistedState,
  manifest: OpenkododMigrationManifest
): void {
  const scope = createOpenkododMigrationSourceScope({
    source: manifest.source,
    catalog: manifest.payload,
    repos: state.repos
  })
  const automationIds = new Set([
    ...(manifest.payload.dormantState?.automations ?? []).map((entry) => entry.id),
    ...state.automations
      .filter(
        (entry) =>
          openkododMigrationOwnsRepoId(scope, getAutomationRunRepoId(entry)) &&
          (entry.executionTargetType !== 'ssh' || entry.executionTargetId === scope.targetId)
      )
      .map((entry) => entry.id)
  ])
  const runIds = new Set((manifest.payload.dormantState?.automationRuns ?? []).map((run) => run.id))
  state.automations = state.automations.filter((entry) => !automationIds.has(entry.id))
  state.automationRuns = state.automationRuns.filter(
    (run) => !runIds.has(run.id) && !automationIds.has(run.automationId)
  )
}
