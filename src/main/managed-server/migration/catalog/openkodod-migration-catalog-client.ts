import { hasModernAutomationLaunchSetup } from '../../../../shared/automations/launch/automation-launch-setup'
import { automationCanonicalLaunchSetup } from '../../../../shared/automations/launch/automation-canonical-launch-setup'
import { AUTOMATION_LAUNCH_SETUP_RUNTIME_CAPABILITY } from '../../../../shared/automations/automation-runtime-capabilities'
import {
  parseOpenkododMigrationCatalogAbortResult,
  parseOpenkododMigrationCatalogState
} from '../../../../shared/openkodod-migration/openkodod-migration-catalog-state'

import type {
  OpenkododMigrationCatalogAbortResult,
  OpenkododMigrationCatalogState,
  OpenkododMigrationManifest
} from '../../../../shared/openkodod-migration/openkodod-migration-manifest'

import {
  findUnsupportedMigrationBlobKind,
  openkododMigrationBlobKindUnsupportedBlocker
} from '../../../../shared/openkodod-migration/openkodod-migration-blob-transfer'

import type { OpenkododMigrationBlobDescriptor } from '../../../../shared/openkodod-migration/openkodod-migration-blob-transfer'
import { openkododMigrationManifestBlobs } from '../../../../shared/openkodod-migration/openkodod-migration-automation-run-history'
import { parsePairingCode } from '../../../../shared/remote-runtime/pairing/pairing'
import { assertOpenkododMigrationRequestFits } from './openkodod-migration-request-budget'
import { hasExtraAgentArgs } from '../../../../shared/agent-launch/startup/automation-extra-agent-args'
import { requiredOpenkododMigrationSourceCapability } from '../../../../shared/openkodod-migration/openkodod-migration-source-kind'
import type { CatalogRequestOptions } from './openkodod-migration-request'
import { sendSupportedMigrationRequest } from './openkodod-migration-request'

type OpenkododCatalogMigrationOperation = 'abort' | 'commit' | 'stage' | 'state'

const METHOD_BY_OPERATION: Record<OpenkododCatalogMigrationOperation, string> = {
  abort: 'openkodod.migration.abortCatalog',
  commit: 'openkodod.migration.commitCatalog',
  stage: 'openkodod.migration.stageCatalog',
  state: 'openkodod.migration.catalogState'
}

export function stageRemoteOpenkododMigrationCatalog(
  pairingCode: string,
  manifest: OpenkododMigrationManifest,
  options: CatalogRequestOptions = {}
): Promise<OpenkododMigrationCatalogState> {
  return requestCatalogState(pairingCode, 'stage', manifest, options)
}

/** Expected blobs make the destination refuse incomplete commits. */
export async function commitRemoteOpenkododMigrationCatalog(
  pairingCode: string,
  manifest: OpenkododMigrationManifest,
  options: CatalogRequestOptions & {
    expectedBlobs?: readonly OpenkododMigrationBlobDescriptor[]
  } = {}
): Promise<OpenkododMigrationCatalogState> {
  const result = await request(pairingCode, 'commit', manifest, options, options.expectedBlobs)
  return parseOpenkododMigrationCatalogState(result, manifest)
}

export function readRemoteOpenkododMigrationCatalogState(
  pairingCode: string,
  manifest: OpenkododMigrationManifest,
  options: CatalogRequestOptions = {}
): Promise<OpenkododMigrationCatalogState> {
  return requestCatalogState(pairingCode, 'state', manifest, options)
}

export async function abortRemoteOpenkododMigrationCatalog(
  pairingCode: string,
  manifest: OpenkododMigrationManifest,
  options: CatalogRequestOptions = {}
): Promise<OpenkododMigrationCatalogAbortResult> {
  const result = await request(pairingCode, 'abort', manifest, options)
  const parsed = parseOpenkododMigrationCatalogAbortResult(result, manifest)
  // Older already-absent replies prove no durability, unlike real aborts.
  if (parsed.state === 'absent' && !parsed.aborted && parsed.durableAbsent !== true) {
    throw new Error('openkodod_migration_abort_durability_unverifiable:destination_update_required')
  }
  return parsed
}

async function requestCatalogState(
  pairingCode: string,
  operation: Exclude<OpenkododCatalogMigrationOperation, 'abort'>,
  manifest: OpenkododMigrationManifest,
  options: CatalogRequestOptions
): Promise<OpenkododMigrationCatalogState> {
  const result = await request(pairingCode, operation, manifest, options)
  return parseOpenkododMigrationCatalogState(result, manifest)
}

async function request(
  pairingCode: string,
  operation: OpenkododCatalogMigrationOperation,
  manifest: OpenkododMigrationManifest,
  options: CatalogRequestOptions,
  expectedBlobs: readonly OpenkododMigrationBlobDescriptor[] = []
): Promise<unknown> {
  const pairing = parsePairingCode(pairingCode)
  if (!pairing) {
    throw new Error('openkodod_migration_pairing_code_invalid')
  }
  // Preserve exact { manifest } wire shape for blob-free and SSH moves.
  const params = expectedBlobs.length > 0 ? { manifest, expectedBlobs } : { manifest }
  // Validation-size limits can exceed sealed-frame capacity; reject before the host closes the socket.
  assertOpenkododMigrationRequestFits(params)
  const imports = operation === 'stage' || operation === 'commit'
  const carriesExtraAgentArgs =
    imports &&
    (manifest.payload.dormantState?.automations ?? []).some((automation) =>
      hasExtraAgentArgs(automation.extraAgentArgs)
    )
  // An older host would drop the blob a manifest names and import without its rows.
  const requiredBlobs = imports
    ? [...expectedBlobs, ...openkododMigrationManifestBlobs(manifest)]
    : expectedBlobs
  const response = await sendSupportedMigrationRequest(
    pairing,
    METHOD_BY_OPERATION[operation],
    params,
    options,
    carriesExtraAgentArgs,
    // Recheck source capabilities on every operation; older hosts may misparse non-SSH sources.
    requiredOpenkododMigrationSourceCapability(manifest.source),
    // Hosts without blob capability would strip expectedBlobs and commit unchecked.
    (capabilities) => {
      if (
        imports &&
        (manifest.payload.dormantState?.automations ?? []).some((automation) =>
          hasModernAutomationLaunchSetup(automationCanonicalLaunchSetup(automation))
        ) &&
        !capabilities.includes(AUTOMATION_LAUNCH_SETUP_RUNTIME_CAPABILITY)
      ) {
        throw new Error(
          'Update OpenKodo on the destination host to keep automation agent launch settings.'
        )
      }
      const unsupported = findUnsupportedMigrationBlobKind(requiredBlobs, capabilities)
      if (unsupported) {
        throw new Error(openkododMigrationBlobKindUnsupportedBlocker(unsupported))
      }
    }
  )
  if (!response.ok) {
    throw new Error(`openkodod_migration_${operation}_failed:${response.error.message}`)
  }
  return response.result
}
