import { OPENKODO_SESSION_ADDRESS_PREFIX } from '../../../../shared/agent-session/identity/openkodo-session-address-prefix'

/** Format bare ids as session addresses (NULL stays NULL); never strip addresses and risk matching handles or Runs. */
export function openkodoSessionAddressSql(openkodoSessionIdSql: string): string {
  return `('${OPENKODO_SESSION_ADDRESS_PREFIX}' || ${openkodoSessionIdSql})`
}

/** The bare id a session address names, NULL for anything else; comparing ids lets the id index serve. */
export function openkodoSessionIdOfAddressSql(addressSql: string): string {
  return `(CASE WHEN substr(${addressSql}, 1, ${OPENKODO_SESSION_ADDRESS_PREFIX.length}) = '${OPENKODO_SESSION_ADDRESS_PREFIX}'
    THEN substr(${addressSql}, ${OPENKODO_SESSION_ADDRESS_PREFIX.length + 1}) END)`
}
