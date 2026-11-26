import { homedir } from 'node:os'
import { join } from 'node:path'
import { stat } from 'node:fs/promises'

/**
 * OpenKodo's data directory. Installs from before the rename used `.orca`;
 * those keep using it so an upgrade never moves credentials out from under a
 * running app. New installs get `.openkodo`.
 */
export const OPENKODO_HOME_DIRNAME = '.openkodo'
export const LEGACY_HOME_DIRNAME = '.orca'

let migratedHome: string | null = null

/** The data directory. Before migration runs this is the new name; after it,
 *  whatever directory the migration settled on. Pure and synchronous, so the
 *  many path builders do not each touch the disk. */
export function openKodoHomePath(home: string = homedir()): string {
  return migratedHome ?? join(home, OPENKODO_HOME_DIRNAME)
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false
  )
}

/** Runs once at startup, before anything reads a credential or hook path. */
export async function resolveOpenKodoHome(home: string = homedir()): Promise<string> {
  const next = join(home, OPENKODO_HOME_DIRNAME)
  const legacy = join(home, LEGACY_HOME_DIRNAME)
  if (!(await exists(next)) && (await exists(legacy))) {
    migratedHome = legacy
    return legacy
  }
  migratedHome = next
  return next
}
