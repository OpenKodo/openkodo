import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  OPENKODOD_VERSION,
  openkododArtifactFilenames
} from '../../../../src/shared/remote-runtime/openkodod-distribution/openkodod-artifacts.ts'
import { readOpenkododMobileWebAssetFilenames } from './openkodod-mobile-web-bundle.mjs'

/** The runtime enters through `.runtime-node`'s executableSha256 string, never its bytes (design D2). */
export function computeOpenkododFullVersion(artifactDir, { target, agentBrowserFilename }) {
  const hash = createHash('sha256')
  for (const filename of openkododArtifactFilenames(
    target,
    readOpenkododMobileWebAssetFilenames(artifactDir)
  )) {
    const artifactPath = join(artifactDir, filename)
    if (!existsSync(artifactPath)) {
      throw new Error(
        `openkodod declares ${filename} in OPENKODOD_ARTIFACTS but never emitted it. Add the build ` +
          'step, or drop it from src/shared/remote-runtime/openkodod-distribution/openkodod-artifacts.ts.'
      )
    }
    hash.update(readFileSync(artifactPath))
  }
  if (agentBrowserFilename && existsSync(join(artifactDir, agentBrowserFilename))) {
    hash.update(readFileSync(join(artifactDir, agentBrowserFilename)))
  }
  return `${OPENKODOD_VERSION}+${hash.digest('hex').slice(0, 12)}`
}
