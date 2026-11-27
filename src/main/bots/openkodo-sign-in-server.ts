import { hostname } from 'node:os'
import type { OpenKodoSignInServer } from '../../shared/bots/host-openkodo-sign-in'

/** This host's name for its signed-out copy when it is a headless OpenKodo server (`openkodo serve`, openkodod),
 *  as `openkodo auth login` names it; null on a computer with OpenKodo's window. */
export function openkodoSignInServer(runtime: {
  servesWithoutWindow(): boolean
}): OpenKodoSignInServer {
  return runtime.servesWithoutWindow() ? hostname().slice(0, 256) : null
}
