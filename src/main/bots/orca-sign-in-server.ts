import { hostname } from 'node:os'
import type { OrcaSignInServer } from '../../shared/bots/host-orca-sign-in'

/** This host's name for its signed-out copy when it is a headless OpenKodo server (`openkodo serve`, orcad),
 *  as `openkodo auth login` names it; null on a computer with OpenKodo's window. */
export function orcaSignInServer(runtime: { servesWithoutWindow(): boolean }): OrcaSignInServer {
  return runtime.servesWithoutWindow() ? hostname().slice(0, 256) : null
}
