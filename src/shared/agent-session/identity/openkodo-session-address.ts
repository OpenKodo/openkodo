import { isAgentSessionId } from '../lifecycle/agent-session-record'
import { isTerminalHandle } from '../../terminal/terminal-handle-prefix'
import { OPENKODO_SESSION_ADDRESS_PREFIX } from './openkodo-session-address-prefix'

/** OpenKodo-minted structured session identity (record id/OPENKODO_AGENT_SESSION_ID), never provider identity. Orchestration stores bare lineage-root ids after /clear,
 * not live replacement ids; derive mail spelling openkodo_session_id:<id> alongside run:/dispatch: addresses.
 * Resolve execution location from records. PTYs have no id today; never use pane keys because later agents inherit panes. */

declare const openkodoSessionIdBrand: unique symbol
declare const openkodoSessionAddressBrand: unique symbol

/** A bare OpenKodo session id; only `isOpenKodoSessionId` and `parseOpenKodoSessionAddress` produce one. */
export type OpenKodoSessionId = string & { readonly [openkodoSessionIdBrand]: true }
/** An `openkodo_session_id:<id>` mail address; only `formatOpenKodoSessionAddress` produces one. */
export type OpenKodoSessionAddress = string & { readonly [openkodoSessionAddressBrand]: true }

export function isOpenKodoSessionId(id: string): id is OpenKodoSessionId {
  return isAgentSessionId(id) && !isTerminalHandle(id)
}

/** A plain random UUID; the agent is on the record, never in the ID. */
export function createOpenKodoSessionId(randomUuid: () => string): OpenKodoSessionId {
  const id = randomUuid()
  // Always true for a UUID; the check brands the id without a type assertion.
  if (!isOpenKodoSessionId(id)) {
    throw new Error(`Not an OpenKodo session id: ${id}`)
  }
  return id
}

export function formatOpenKodoSessionAddress(
  openkodoSessionId: OpenKodoSessionId
): OpenKodoSessionAddress {
  const address = `${OPENKODO_SESSION_ADDRESS_PREFIX}${openkodoSessionId}`
  // Always true for a checked id; the check brands the address without a type assertion.
  if (!isOpenKodoSessionAddress(address)) {
    throw new Error(`Not an OpenKodo session id: ${openkodoSessionId}`)
  }
  return address
}

/** The bare OpenKodo session id of an `openkodo_session_id:<id>` address; anything else reads as null. */
export function parseOpenKodoSessionAddress(
  address: string | null | undefined
): OpenKodoSessionId | null {
  if (!address?.startsWith(OPENKODO_SESSION_ADDRESS_PREFIX)) {
    return null
  }
  const id = address.slice(OPENKODO_SESSION_ADDRESS_PREFIX.length)
  return isOpenKodoSessionId(id) ? id : null
}

function isOpenKodoSessionAddress(address: string): address is OpenKodoSessionAddress {
  return parseOpenKodoSessionAddress(address) !== null
}
