import { createHash } from 'node:crypto'
import { readFileSync, realpathSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { OPENKODOD_LAUNCHER_FILENAME, OPENKODOD_SERVER_ENTRY_FILENAME } from './openkodod-artifacts'

export const OPENKODOD_BUILD_HASH_LENGTH = 16

/** The launcher embeds its server digest, keeping the hash older clients calculate. */
export function hashOpenkododLauncher(entryPath: string): string {
  const entry = realpathSync(entryPath)
  const launcher =
    basename(entry) === OPENKODOD_SERVER_ENTRY_FILENAME
      ? join(dirname(entry), OPENKODOD_LAUNCHER_FILENAME)
      : entry
  return createHash('sha256')
    .update(readFileSync(launcher))
    .digest('hex')
    .slice(0, OPENKODOD_BUILD_HASH_LENGTH)
}
