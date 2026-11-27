import { join } from 'node:path'
import { hashOpenkododLauncher } from '../../../shared/remote-runtime/openkodod-distribution/openkodod-build-identity'
import { OPENKODOD_LAUNCHER_FILENAME } from '../../../shared/remote-runtime/openkodod-distribution/openkodod-artifacts'

export function computeLocalOpenkododBuildHash(localOpenkododDir: string): string {
  return hashOpenkododLauncher(join(localOpenkododDir, OPENKODOD_LAUNCHER_FILENAME))
}
