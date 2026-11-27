// `openkodo serve --supervise` runs openkodod under a service manager, which restarts it routinely.
import process from 'node:process'
import { OPENKODO_SERVE_SUPERVISED_ENV } from '../../../shared/remote-runtime/serve-supervisor/serve-supervised-terminal-durability'

/** A supervised service must not hand out terminals that its next restart would kill. */
export class OpenkododTerminalsNotDurableError extends Error {
  constructor(readonly daemonFailure: string) {
    super(
      `The terminal daemon did not start (${daemonFailure}). This server runs under a service ` +
        'manager, so it will not start with terminals that a restart would lose; the supervisor ' +
        'retries with backoff.'
    )
    this.name = 'OpenkododTerminalsNotDurableError'
  }
}

/** Read once and drop it, so nothing openkodod starts inherits it. */
export function takeOpenkododServeSupervision(env: NodeJS.ProcessEnv = process.env): boolean {
  const supervised = env[OPENKODO_SERVE_SUPERVISED_ENV] === '1'
  delete env[OPENKODO_SERVE_SUPERVISED_ENV]
  return supervised
}
