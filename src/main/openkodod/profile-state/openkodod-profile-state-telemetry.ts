import type { ProfileStateStorageClassification } from '../../persistence/profile-state/database/profile-state-storage-classification'

/** Exclude paths, profile IDs and serialized state from fleet telemetry. */
export type OpenkododProfileStateAuthoritySelection = {
  backend: 'sqlite'
  classification: ProfileStateStorageClassification
  authority_mode: 'sqlite-established'
  runtime: 'openkodod'
  migrated: boolean
}

type OpenkododProfileStateTelemetrySink = (line: string) => void

export function formatOpenkododProfileStateAuthoritySelected(
  selection: OpenkododProfileStateAuthoritySelection
): string {
  // Select fields explicitly so structural typing cannot leak extra runtime data.
  return `[openkodod-telemetry] ${JSON.stringify({
    event: 'profile_state_authority_selected',
    backend: selection.backend,
    classification: selection.classification,
    authority_mode: selection.authority_mode,
    runtime: selection.runtime,
    migrated: selection.migrated
  })}`
}

/** Use stderr without desktop dependencies; telemetry failures must not block serving. */
export function emitOpenkododProfileStateAuthoritySelected(
  selection: OpenkododProfileStateAuthoritySelection,
  sink: OpenkododProfileStateTelemetrySink = (line) => console.error(line)
): void {
  try {
    sink(formatOpenkododProfileStateAuthoritySelected(selection))
  } catch {}
}
