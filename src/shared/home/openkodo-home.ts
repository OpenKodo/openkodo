import { homedir } from 'node:os'
import { join } from 'node:path'
import { cp, rename, stat } from 'node:fs/promises'

/**
 * OpenKodo's data directory, `~/.openkodo`. One-time upgrade step: a profile
 * written by the pre-rename build under its old dot-directory is moved here on
 * first launch, so credentials and settings are never lost.
 */
export const OPENKODO_HOME_DIRNAME = '.openkodo'
const PRE_RENAME_HOME_DIRNAME = '.orca'

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
  const previous = join(home, PRE_RENAME_HOME_DIRNAME)
  // Tests must never move a developer's real profile; production upgrades do.
  const mayMigrate = process.env.VITEST === undefined && process.env.NODE_ENV !== 'test'
  if (mayMigrate && !(await exists(next)) && (await exists(previous))) {
    try {
      await rename(previous, next)
    } catch {
      await cp(previous, next, { recursive: true, errorOnExist: true, force: false })
    }
  }
  migratedHome = next
  return next
}
