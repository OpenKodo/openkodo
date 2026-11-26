import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { PLUGIN_MANIFEST_FILENAMES } from '../../../shared/plugins/manifest/plugin-manifest'

/** First existing manifest file, preferring the OpenKodo name over the pre-rebrand one. */
export function findPluginManifestFile(dir: string): string | null {
  for (const name of PLUGIN_MANIFEST_FILENAMES) {
    const path = join(dir, name)
    if (existsSync(path)) {
      return path
    }
  }
  return null
}
