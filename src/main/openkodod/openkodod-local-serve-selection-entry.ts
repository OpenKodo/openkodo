// App-side CLI probe under ELECTRON_RUN_AS_NODE: print one OPENKODO_SERVE_RUNTIME selection; diagnostics use stderr.
import { join } from 'node:path'
import process from 'node:process'
import {
  formatServeRuntimeSelection,
  OPENKODOD_LOCAL_SERVE_SELECTION_FLAGS as FLAGS
} from '../../shared/remote-runtime/serve-supervisor/openkodod-local-serve-selection'
import { selectServeRuntime } from './serve-startup/openkodod-local-serve-selection'
import { pruneDesktopOpenkododArtifactCache } from './artifact-slots/openkodod-artifact-cache-retention'
import { findAppImageNodeRuntime } from '../node-runtime/appimage-bundled-node-runtime'

function flagValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag)
  return index === -1 ? null : (argv[index + 1] ?? null)
}

async function run(argv: readonly string[]): Promise<void> {
  const userDataPath = flagValue(argv, FLAGS.userData)
  const appRoot = flagValue(argv, FLAGS.appRoot)
  if (!userDataPath || !appRoot) {
    throw new Error(`${FLAGS.userData} and ${FLAGS.appRoot} are required`)
  }
  const selection = await selectServeRuntime({
    env: process.env,
    platform: process.platform,
    userDataPath,
    templateDirs: [
      ...(process.resourcesPath ? [join(process.resourcesPath, 'openkodod-template')] : []),
      join(appRoot, 'out', 'openkodod-template')
    ],
    bundledNodeRuntime: findAppImageNodeRuntime(process.resourcesPath)
  })
  // openkodod skips desktop startup, so bound the slot cache here too.
  await pruneDesktopOpenkododArtifactCache(
    userDataPath,
    selection.kind === 'openkodod' ? [selection.version] : []
  ).catch(() => [])
  process.stdout.write(`${formatServeRuntimeSelection(selection)}\n`, () => process.exit(0))
}

run(process.argv.slice(2)).catch((error: unknown) => {
  // Selection failure falls back to Electron rather than failing openkodo serve.
  const reason = `openkodod selection failed: ${error instanceof Error ? error.message : String(error)}`
  process.stdout.write(`${formatServeRuntimeSelection({ kind: 'electron', reason })}\n`, () =>
    process.exit(0)
  )
})
