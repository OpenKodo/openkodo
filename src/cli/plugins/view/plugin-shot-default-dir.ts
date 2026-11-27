import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { PLUGIN_MANIFEST_FILENAMES } from '../../../shared/plugins/manifest/plugin-manifest'

/**
 * The plugin folder `cwd` is in: the nearest directory holding a plugin manifest, looking up no
 * further than the repository root (the first directory with `.git`).
 */
export function enclosingPluginFolder(
  cwd: string,
  exists: (path: string) => boolean = existsSync
): string | null {
  for (let dir = cwd; ; dir = dirname(dir)) {
    if (PLUGIN_MANIFEST_FILENAMES.some((name) => exists(join(dir, name)))) {
      return dir
    }
    if (exists(join(dir, '.git')) || dirname(dir) === dir) {
      return null
    }
  }
}

/** Where shots go without --out: beside the plugin, as `dev watch --shot` writes them. */
export function defaultPluginShotsDir(
  cwd: string,
  exists: (path: string) => boolean = existsSync
): string {
  return join(enclosingPluginFolder(cwd, exists) ?? cwd, '.openkodo', 'shots')
}
