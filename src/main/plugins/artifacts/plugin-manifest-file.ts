import { createReadStream } from 'node:fs'
import { access } from 'node:fs/promises'
import { basename, join } from 'node:path'
import {
  PLUGIN_MANIFEST_FILENAME,
  PLUGIN_MANIFEST_FILENAMES
} from '../../../shared/plugins/manifest/plugin-manifest'

// Bound startup/preview metadata reads independently of artifact payload sizes.
export const PLUGIN_MANIFEST_MAX_BYTES = 1024 * 1024

/** New plugins write `openkodo-plugin.json`; plugins installed before the rebrand keep their name. */
export async function findPluginManifestPath(rootDir: string): Promise<string | null> {
  for (const fileName of PLUGIN_MANIFEST_FILENAMES) {
    const path = join(rootDir, fileName)
    try {
      await access(path)
      return path
    } catch {
      // Try the next name.
    }
  }
  return null
}

export async function resolvePluginManifestPath(
  rootDir: string
): Promise<{ path: string; fileName: string }> {
  const found = await findPluginManifestPath(rootDir)
  if (found) {
    return { path: found, fileName: basename(found) }
  }
  return { path: join(rootDir, PLUGIN_MANIFEST_FILENAME), fileName: PLUGIN_MANIFEST_FILENAME }
}

export async function readPluginManifestText(rootDir: string): Promise<string> {
  const chunks: Buffer[] = []
  let totalBytes = 0
  const { path, fileName } = await resolvePluginManifestPath(rootDir)
  const stream = createReadStream(path)
  for await (const chunk of stream) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    totalBytes += bytes.byteLength
    if (totalBytes > PLUGIN_MANIFEST_MAX_BYTES) {
      throw new Error(`${fileName} exceeds ${PLUGIN_MANIFEST_MAX_BYTES} bytes`)
    }
    chunks.push(bytes)
  }
  return Buffer.concat(chunks, totalBytes).toString('utf8')
}
