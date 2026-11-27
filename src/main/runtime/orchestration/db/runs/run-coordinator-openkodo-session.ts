import { openkodoSessionAddressSql } from '../openkodo-session-address-sql'
import type { OpenKodoSessionId } from '../../../../../shared/agent-session/identity/openkodo-session-address'
import type { RunRow } from '../orchestration-records'

type RunCoordinatorOpenKodoSessionFields = Pick<
  RunRow,
  | 'coordinator_openkodo_session_id'
  | 'coordinator_openkodo_session_id_generation'
  | 'consumer_generation'
>

/** Count a coordinator session id only at its stamped consumer generation; older writers bump generation without clearing it. */
export function currentRunCoordinatorOpenKodoSessionId(
  run: RunCoordinatorOpenKodoSessionFields
): OpenKodoSessionId | null {
  return run.coordinator_openkodo_session_id_generation === run.consumer_generation
    ? run.coordinator_openkodo_session_id
    : null
}

/** The same rule in SQL, for a `runs` row named `row` (a table name, alias, or `NEW`). */
export function currentRunCoordinatorOpenKodoSessionIdSql(row: string): string {
  return `(CASE WHEN ${row}.coordinator_openkodo_session_id_generation = ${row}.consumer_generation
    THEN ${row}.coordinator_openkodo_session_id END)`
}

/** The coordinator's `openkodo_session_id:<id>` address in SQL; NULL when it has no current OpenKodo session id. */
export function currentRunCoordinatorSessionAddressSql(row: string): string {
  return openkodoSessionAddressSql(currentRunCoordinatorOpenKodoSessionIdSql(row))
}
