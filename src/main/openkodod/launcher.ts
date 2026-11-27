import { createHash } from 'node:crypto'
import { readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { OPENKODOD_SERVER_ENTRY_FILENAME } from '../../shared/remote-runtime/openkodod-distribution/openkodod-artifacts'
import {
  assertOpenkododServerRuntime,
  handoffToBundledOpenkodod
} from './runtime-launch/openkodod-bundled-runtime'
import { OPENKODOD_EXIT_CONFIGURATION } from './serve-startup/openkodod-configuration-exit'
import { enableManagedOpenkododCompileCache } from './runtime-launch/openkodod-compile-cache'

declare const OPENKODOD_SERVER_SHA256: string

let loadServer: (() => void) | undefined

try {
  if (!handoffToBundledOpenkodod()) {
    assertOpenkododServerRuntime()
    const entry = realpathSync(process.argv[1] ?? __filename)
    const server = join(dirname(entry), OPENKODOD_SERVER_ENTRY_FILENAME)
    if (
      createHash('sha256').update(readFileSync(server)).digest('hex') !== OPENKODOD_SERVER_SHA256
    ) {
      throw new Error('The OpenKodo server does not match its launcher')
    }
    loadServer = () => {
      enableManagedOpenkododCompileCache(dirname(entry))
      createRequire(entry)(server)
    }
  }
} catch (error) {
  console.error('openkodod: failed to launch:', error)
  process.exit(OPENKODOD_EXIT_CONFIGURATION)
}

loadServer?.()
