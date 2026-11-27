#!/usr/bin/env node

import { createHash } from 'node:crypto'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import {
  OPENKODOD_NODE_PTY_DIR,
  OPENKODOD_NODE_RUNTIME_MARKER_FILENAME,
  OPENKODOD_PROVIDER_EXEC_FILENAME,
  OPENKODOD_PROVIDER_EXEC_SLOT_FILE,
  OPENKODOD_SERVER_TARGET_FILENAME,
  OPENKODOD_TEMPLATE_MANIFEST_FILENAME,
  OPENKODOD_TEMPLATE_TARGETS_DIR,
  isOpenkododExecutableArtifact,
  openkododNodePtySlotFiles,
  openkododTemplateCommonFilenames,
  openkododTemplateTargetFilenames
} from '../../../../src/shared/remote-runtime/openkodod-distribution/openkodod-artifacts.ts'
import { openkododAgentBrowserNativeName } from '../../../../src/shared/remote-runtime/openkodod-distribution/openkodod-agent-browser-name.ts'
import {
  COMPAT_SERVER_TARGET_BASES,
  COMPAT_SERVER_TARGETS,
  OPENKODOD_TEMPLATE_TARGETS,
  pinnedNodeRuntimeAsset
} from '../../../../src/shared/node-runtime/node-runtime-pin.ts'
import { OPENKODOD_PREBUILDS_DIR } from '../prebuilds/build-openkodod-prebuilds.mjs'
import {
  COMPAT_SLOT_ADDONS,
  findCompatAddonGaps,
  findSlotProblems,
  readManifest
} from '../prebuilds/openkodod-prebuild-slot-contents.mjs'
import { runProcessSync } from '@openkodo/process-host'
import { verifyPackagedOpenkododTemplate } from './verify-packaged-openkodod-template.cjs'
import { readOpenkododMobileWebAssetFilenames } from '../server-bundle/openkodod-mobile-web-bundle.mjs'
import { assertNotDarkBuild, darkBuildMarkers } from '../../../dark-build-switches.cjs'

const root = resolve(import.meta.dirname, '../../../..')
const outputDir = join(root, 'out', 'openkodod-template')
const buildDir = join(root, 'out', '.openkodod-template-build')

function copy(source, destination, executable = false) {
  mkdirSync(dirname(destination), { recursive: true })
  copyFileSync(source, destination)
  if (executable && process.platform !== 'win32') {
    chmodSync(destination, 0o755)
  }
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/** One full package per target; each needs that target's node-pty slot in out/openkodod-prebuilds. */
function buildTargetPackage(target) {
  const packageDir = join(buildDir, target, 'openkodod')
  const result = runProcessSync({
    program: process.execPath,
    args: [
      '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
      join(root, 'config/scripts/openkodod-distribution/prebuilds/build-openkodod-node.mjs'),
      '--target',
      target,
      '--out-dir',
      packageDir
    ],
    cwd: root,
    // Desktop template omits optional ~10MB browsers per target; packaging references the app's own copy instead.
    // A checkout has no app copy, so OPENKODOD_OMIT_AGENT_BROWSER=0 keeps drivers for local Chromium serve.
    env: {
      ...process.env,
      OPENKODOD_OMIT_AGENT_BROWSER: process.env.OPENKODOD_OMIT_AGENT_BROWSER ?? '1'
    },
    stdio: 'inherit',
    timeoutMs: null
  })
  if (result.code !== 0) {
    throw new Error(
      `openkodod ${target} package build failed with exit ${result.code ?? 'unknown'}`
    )
  }
  return packageDir
}

function stageTarget(target, packageDir) {
  const destination = join(outputDir, OPENKODOD_TEMPLATE_TARGETS_DIR, target)
  const files = {}
  for (const filename of openkododTemplateTargetFilenames(target)) {
    const staged = join(destination, ...filename.split('/'))
    copy(join(packageDir, ...filename.split('/')), staged, isOpenkododExecutableArtifact(filename))
    files[filename] = sha256(staged)
  }
  const browserName = openkododAgentBrowserNativeName(
    target.split('-')[0],
    target.split('-')[1],
    target.endsWith('-musl') ? 'musl' : 'glibc'
  )
  const browserSource = join(packageDir, browserName)
  if (!existsSync(browserSource)) {
    return { files }
  }
  const browserDestination = join(destination, browserName)
  copy(browserSource, browserDestination, true)
  return { files, browserName, browserSha256: sha256(browserDestination) }
}

// Allow partial CI --targets only; shipped templates require every target.
export function requestedTemplateTargets(argv = process.argv) {
  const index = argv.indexOf('--targets')
  if (index === -1) {
    return OPENKODOD_TEMPLATE_TARGETS
  }
  const targets = (argv[index + 1] ?? '').split(',').filter(Boolean)
  const unknown = targets.filter((target) => !OPENKODOD_TEMPLATE_TARGETS.includes(target))
  if (targets.length === 0 || unknown.length > 0) {
    throw new Error(
      `--targets needs a comma-separated subset of ${OPENKODOD_TEMPLATE_TARGETS.join(',')}; got ${argv[index + 1] ?? 'nothing'}`
    )
  }
  return [...new Set(targets)]
}

// Compat target reuses base package with slot addons/runtime marker swapped; omit missing slots so rung B reports unavailable.
function stageCompatTarget(compat, basePackageDir) {
  const problems = findSlotProblems(
    readManifest(OPENKODOD_PREBUILDS_DIR),
    OPENKODOD_PREBUILDS_DIR,
    [compat]
  )
  if (problems.length > 0) {
    process.stdout.write(
      `[build-openkodod-template] skipping compat target ${compat}: ${problems.join('; ')}\n`
    )
    return null
  }
  const destination = join(outputDir, OPENKODOD_TEMPLATE_TARGETS_DIR, compat)
  const slotFiles = new Map([
    ...openkododNodePtySlotFiles(compat).map((file) => [
      `${OPENKODOD_NODE_PTY_DIR}/build/Release/${file}`,
      join(OPENKODOD_PREBUILDS_DIR, compat, ...file.split('/'))
    ]),
    ...Object.entries(COMPAT_SLOT_ADDONS).map(([file, shipped]) => [
      shipped,
      join(OPENKODOD_PREBUILDS_DIR, compat, ...file.split('/'))
    ]),
    [
      OPENKODOD_PROVIDER_EXEC_FILENAME,
      join(OPENKODOD_PREBUILDS_DIR, compat, ...OPENKODOD_PROVIDER_EXEC_SLOT_FILE.split('/'))
    ]
  ])
  // Why fatal: the base binary would pass every check here and fail only on a compat host.
  const gaps = findCompatAddonGaps(openkododTemplateTargetFilenames(compat), slotFiles)
  if (gaps.length > 0) {
    throw new Error(`compat target ${compat} would ship base-target addons: ${gaps.join(', ')}`)
  }
  const files = {}
  for (const filename of openkododTemplateTargetFilenames(compat)) {
    const staged = join(destination, ...filename.split('/'))
    if (filename === OPENKODOD_SERVER_TARGET_FILENAME) {
      mkdirSync(dirname(staged), { recursive: true })
      writeFileSync(staged, `${compat}\n`)
    } else if (filename === OPENKODOD_NODE_RUNTIME_MARKER_FILENAME) {
      mkdirSync(dirname(staged), { recursive: true })
      writeFileSync(staged, `${pinnedNodeRuntimeAsset(compat).executableSha256}\n`)
    } else {
      const source = slotFiles.get(filename) ?? join(basePackageDir, ...filename.split('/'))
      copy(source, staged, isOpenkododExecutableArtifact(filename))
    }
    files[filename] = sha256(staged)
  }
  return { files }
}

/**
 * `--dark-test-template` lets a dark switch through for test servers only; the template then
 * carries the switch's marker, which packaging refuses.
 */
export function assertTemplateBuildAllowed(argv = process.argv, env = process.env) {
  if (!argv.includes('--dark-test-template')) {
    // The template is what releases ship as the server; a dark build must never become one.
    assertNotDarkBuild([], env)
  }
}

function sameBytes(left, right) {
  return sha256(left) === sha256(right)
}

async function main() {
  assertTemplateBuildAllowed()
  const templateTargets = requestedTemplateTargets()
  rmSync(buildDir, { recursive: true, force: true })
  const packages = Object.fromEntries(
    templateTargets.map((target) => [target, buildTargetPackage(target)])
  )
  rmSync(outputDir, { recursive: true, force: true })
  mkdirSync(outputDir, { recursive: true })
  const [firstTarget] = templateTargets
  // Every package carries the same page: its manifest is a common file, checked byte for byte below.
  const commonArtifacts = openkododTemplateCommonFilenames(
    readOpenkododMobileWebAssetFilenames(packages[firstTarget])
  )
  for (const filename of commonArtifacts) {
    const source = join(packages[firstTarget], ...filename.split('/'))
    // Why check every target: the template keeps one copy, so a per-target difference would ship wrong bytes.
    for (const target of templateTargets) {
      if (!sameBytes(source, join(packages[target], ...filename.split('/')))) {
        throw new Error(`${filename} differs between ${firstTarget} and ${target} packages`)
      }
    }
    copy(source, join(outputDir, ...filename.split('/')), isOpenkododExecutableArtifact(filename))
  }
  const targets = Object.fromEntries(
    templateTargets.map((target) => [target, stageTarget(target, packages[target])])
  )
  // A partial CI template stages a compat target only beside its base target.
  for (const compat of COMPAT_SERVER_TARGETS.filter((candidate) =>
    templateTargets.includes(COMPAT_SERVER_TARGET_BASES[candidate])
  )) {
    const staged = stageCompatTarget(compat, packages[COMPAT_SERVER_TARGET_BASES[compat]])
    if (staged) {
      targets[compat] = staged
    }
  }
  const commonSha256 = Object.fromEntries(
    commonArtifacts.map((filename) => [filename, sha256(join(outputDir, filename))])
  )
  writeFileSync(
    join(outputDir, OPENKODOD_TEMPLATE_MANIFEST_FILENAME),
    `${JSON.stringify({ schemaVersion: 3, commonSha256, targets }, null, 2)}\n`
  )
  verifyPackagedOpenkododTemplate(join(root, 'out'), templateTargets)
  // Outside the manifest, so deploys never copy it; it marks the whole template as test-only.
  for (const marker of darkBuildMarkers()) {
    writeFileSync(join(outputDir, marker.fileName), marker.text)
  }
  rmSync(buildDir, { recursive: true, force: true })
  process.stdout.write(`[build-openkodod-template] ok — ${Object.keys(targets).length} targets\n`)
}

if (process.argv[1]?.endsWith('build-openkodod-template.mjs')) {
  await main()
}
