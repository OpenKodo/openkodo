import { homedir } from 'node:os'
import { join } from 'node:path'

/** OpenKodo's data directory, `~/.openkodo`. */
export const OPENKODO_HOME_DIRNAME = '.openkodo'

/** The data directory. Pure and synchronous, so the many path builders do not touch the disk. */
export function openKodoHomePath(home: string = homedir()): string {
  return join(home, OPENKODO_HOME_DIRNAME)
}

/** Runs once at startup, before anything reads a credential or hook path. */
export async function resolveOpenKodoHome(home: string = homedir()): Promise<string> {
  return join(home, OPENKODO_HOME_DIRNAME)
}
