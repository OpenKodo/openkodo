import {
  openkododMigrationAutomationRunHistoryBlob,
  withOpenkododMigrationAutomationRunHistory
} from '../../../../shared/openkodod-migration/openkodod-migration-automation-run-history'
import type { OpenkododMigrationManifest } from '../../../../shared/openkodod-migration/openkodod-migration-manifest'
import { readOpenkododMigrationBlob } from '../blob-transfer/openkodod-migration-blob-staging'

/** The manifest signs the history's digest, so its rows import with the catalog or not at all. */
export function withStagedAutomationRunHistory(
  manifest: OpenkododMigrationManifest,
  blobRoot: string
): OpenkododMigrationManifest {
  const ref = manifest.payload.dormantState?.automationRunHistory
  if (!ref) {
    return manifest
  }
  const descriptor = openkododMigrationAutomationRunHistoryBlob(ref)
  return withOpenkododMigrationAutomationRunHistory(
    manifest,
    readOpenkododMigrationBlob(manifest, blobRoot, descriptor).toString('utf8')
  )
}
