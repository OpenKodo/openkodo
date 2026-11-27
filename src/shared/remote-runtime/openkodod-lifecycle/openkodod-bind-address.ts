// SSH forwarding needs only loopback; network exposure must be an explicit operator choice.
import { isIP } from 'node:net'

export const OPENKODOD_LOOPBACK_BIND_HOST = '127.0.0.1'
const ALL_INTERFACES_V4 = '0.0.0.0'
const ALL_INTERFACES_V6 = '::'

export class OpenkododBindAddressError extends Error {
  readonly code = 'openkodod_invalid_bind_address'
}

/** Require literal IPs so DNS cannot silently choose a public/private bind interface. */
export function resolveOpenkododBindHost(raw?: string): string {
  if (raw === undefined) {
    return OPENKODOD_LOOPBACK_BIND_HOST
  }
  const value = raw.trim()
  if (value === '') {
    throw new OpenkododBindAddressError('--bind expects an address')
  }
  if (value === 'localhost') {
    return OPENKODOD_LOOPBACK_BIND_HOST
  }
  if (value.includes('%')) {
    throw new OpenkododBindAddressError(
      `--bind does not support scoped IPv6 addresses (got '${value}'). Use an unscoped literal IPv6 address.`
    )
  }
  if (isIP(value) === 0) {
    throw new OpenkododBindAddressError(
      `--bind expects a literal IP address (got '${value}'). Hostnames are refused because ` +
        'DNS decides which interface would be bound. Use 127.0.0.1 for loopback, or ' +
        '0.0.0.0 to expose every interface.'
    )
  }
  return value
}

export function bindHostIsNetworkExposed(host: string): boolean {
  if (host === ALL_INTERFACES_V4 || host === ALL_INTERFACES_V6) {
    return true
  }
  if (isIP(host) === 4) {
    return !host.startsWith('127.')
  }
  return host !== '::1'
}

export function describeOpenkododBindExposure(host: string): string {
  return bindHostIsNetworkExposed(host)
    ? `The OpenKodo server is bound to ${host} and is reachable from the network. Anything that can reach ` +
        'this port can attempt pairing.'
    : `The OpenKodo server is bound to ${host} (local only). Reach it from another machine with an SSH ` +
        'local port-forward, or re-launch with --bind to expose it.'
}
