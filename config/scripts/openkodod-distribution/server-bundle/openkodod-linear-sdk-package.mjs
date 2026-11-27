import { build } from 'esbuild'
import { join } from 'node:path'
import { OPENKODOD_LINEAR_SDK_ENTRY } from '../../../../src/shared/remote-runtime/openkodod-distribution/openkodod-artifacts.ts'
import { OPENKODOD_SERVER_BUILD_TARGET } from './openkodod-entry-build.mjs'

// Bundle @linear/sdk into one CJS file for lazy require: copying would expose chunk names that change each release.
export async function stageOpenkododLinearSdk(root, outputDir) {
  await build({
    stdin: {
      contents: "module.exports = require('@linear/sdk')",
      resolveDir: root,
      sourcefile: 'openkodod-linear-sdk-entry.js'
    },
    bundle: true,
    platform: 'node',
    target: OPENKODOD_SERVER_BUILD_TARGET,
    format: 'cjs',
    outfile: join(outputDir, OPENKODOD_LINEAR_SDK_ENTRY),
    minify: true,
    sourcemap: false,
    logLevel: 'error'
  })
}
