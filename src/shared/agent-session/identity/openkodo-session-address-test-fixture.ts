import { isOpenKodoSessionId, type OpenKodoSessionId } from './openkodo-session-address'

/** A literal OpenKodo session id for a test, checked by the same predicate production uses. */
export function testOpenKodoSessionId(id: string): OpenKodoSessionId {
  if (!isOpenKodoSessionId(id)) {
    throw new Error(`Not an OpenKodo session id: ${id}`)
  }
  return id
}
