/** Finished automation runs travel as one blob; the signed manifest carries only its digest, so run
 * history never bounds the manifest. Format changes require a new capability. */
import type { AutomationRun } from '../automations/history/automation-run'
import type { OpenkododMigrationBlobDescriptor } from './openkodod-migration-blob-transfer'
import {
  serializeOpenkododMigrationValue,
  type OpenkododMigrationAutomationRunHistoryRef,
  type OpenkododMigrationManifest
} from './openkodod-migration-manifest'
import { parseOpenkododMigrationCatalogPayload } from './openkodod-migration-manifest-validation'
import { requiredRecord } from './openkodod-migration-dormant-value-validation'

const OPENKODOD_MIGRATION_AUTOMATION_RUN_HISTORY_VERSION = 1

/** Canonical, so a re-export of an unchanged source reproduces the journaled digest. */
export function serializeOpenkododMigrationAutomationRunHistory(
  runs: readonly AutomationRun[]
): string {
  return serializeOpenkododMigrationValue({
    version: OPENKODOD_MIGRATION_AUTOMATION_RUN_HISTORY_VERSION,
    runs
  })
}

export function openkododMigrationAutomationRunHistoryBlob(
  ref: OpenkododMigrationAutomationRunHistoryRef
): OpenkododMigrationBlobDescriptor {
  return { blobKind: 'automation-run-history', key: 'migration', ...ref }
}

/** Blobs the manifest itself names; its commit is refused until they are staged. */
export function openkododMigrationManifestBlobs(
  manifest: Pick<OpenkododMigrationManifest, 'payload'>
): OpenkododMigrationBlobDescriptor[] {
  const ref = manifest.payload.dormantState?.automationRunHistory
  return ref ? [openkododMigrationAutomationRunHistoryBlob(ref)] : []
}

/** The manifest with its runs inline, validated against its own catalog as inline runs would be. */
export function withOpenkododMigrationAutomationRunHistory<
  T extends Pick<OpenkododMigrationManifest, 'payload'>
>(manifest: T, text: string): T {
  let document: unknown
  try {
    document = JSON.parse(text)
  } catch {
    throw new Error('openkodod_migration_automation_run_history_invalid')
  }
  const record = requiredRecord(document, 'openkodod_migration_automation_run_history_invalid')
  if (record.version !== OPENKODOD_MIGRATION_AUTOMATION_RUN_HISTORY_VERSION) {
    throw new Error('openkodod_migration_automation_run_history_version_unsupported')
  }
  const { automationRunHistory: _ref, ...dormantState } = manifest.payload.dormantState ?? {}
  return {
    ...manifest,
    payload: parseOpenkododMigrationCatalogPayload({
      ...manifest.payload,
      dormantState: { ...dormantState, automationRuns: record.runs }
    })
  }
}
