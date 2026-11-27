import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import {
  classifyNodeServerChanges,
  collectNodeServerInputs
} from '../../node-server/qualification/node-server-change-scope.mjs'
import {
  OPENKODOD_CHILD_ENTRY_POINTS,
  OPENKODOD_ENTRY_POINT,
  OPENKODOD_LAUNCHER_ENTRY_POINT
} from '../server-bundle/openkodod-entry-build.mjs'

const ENTRY_POINTS = [
  OPENKODOD_ENTRY_POINT,
  OPENKODOD_LAUNCHER_ENTRY_POINT,
  ...Object.values(OPENKODOD_CHILD_ENTRY_POINTS),
  'src/cli/index.ts',
  'config/scripts/openkodod-distribution/prebuilds/build-openkodod-node.mjs',
  'config/scripts/openkodod-distribution/prebuilds/build-openkodod-prebuilds.mjs',
  'config/scripts/openkodod-distribution/server-bundle/build-openkodod.mjs',
  'config/scripts/native-build/node-addons/ensure-native-runtime.mjs',
  'config/scripts/native-build/node-addons/rebuild-native-deps.mjs',
  'config/scripts/cli-build/verify-cli-bin.mjs',
  'config/scripts/development/setup/install-dev-cli.mjs',
  'config/scripts/development/launch/openkodo-dev.mjs',
  'config/scripts/runtime-verification/daemon-lifecycle/runtime-serve-terminal-smoke.mjs',
  'config/scripts/openkodod-distribution/qualification/openkodod-terminal-smoke-change-scope.mjs'
]

export function collectOpenkododTerminalSmokeInputs() {
  return collectNodeServerInputs({ entryPoints: ENTRY_POINTS })
}

export async function classifyOpenkododTerminalSmokeChanges(
  changedFiles,
  collect = collectOpenkododTerminalSmokeInputs
) {
  const forced = changedFiles.find(
    (file) =>
      ENTRY_POINTS.includes(file) ||
      file === '.github/workflows/pr.yml' ||
      file.startsWith('config/scripts/openkodod-terminal-smoke-') ||
      file.startsWith(
        'config/scripts/openkodod-distribution/qualification/openkodod-terminal-smoke-'
      ) ||
      file.startsWith('config/scripts/runtime-serve-terminal-smoke') ||
      file.startsWith(
        'config/scripts/runtime-verification/daemon-lifecycle/runtime-serve-terminal-smoke'
      ) ||
      // createRequire-loaded native probes are invisible to esbuild's import graph.
      (file.startsWith('config/scripts/') && file.endsWith('.cjs')) ||
      // CLI emit and runtime resources include files opened by path, outside the import graph.
      file.startsWith('src/cli/') ||
      file.startsWith('src/shared/') ||
      file.startsWith('resources/')
  )
  if (forced) {
    return { shouldRun: true, reason: `Smoke input changed: ${forced}` }
  }
  // Retain the headless-server gate's native, worker, toolchain and failed-analysis safeguards.
  return classifyNodeServerChanges(changedFiles, collect)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const changedFiles = readFileSync(process.argv[2], 'utf8').split('\0').filter(Boolean)
  const result = await classifyOpenkododTerminalSmokeChanges(changedFiles)
  console.error(result.reason)
  process.stdout.write(`${result.shouldRun}\n`)
}
