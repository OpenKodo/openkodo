const { createHash } = require('node:crypto')
const { existsSync, lstatSync, readFileSync, unlinkSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const {
  OPENKODOD_TEMPLATE_MANIFEST_FILENAME,
  OPENKODOD_TEMPLATE_TARGETS_DIR,
  openkododRipgrepArtifact,
  openkododTemplatePackagedRipgrep
} = require('../../../../src/shared/remote-runtime/openkodod-distribution/openkodod-artifacts.ts')
const { verifyPackagedOpenkododTemplate } = require('./verify-packaged-openkodod-template.cjs')

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/** Only compact the desktop's copy; the qualified template artifact remains self-contained. */
function compactPackagedOpenkododRipgrep(resourcesDir) {
  const templateDir = join(resourcesDir, 'openkodod-template')
  const manifestPath = join(templateDir, OPENKODOD_TEMPLATE_MANIFEST_FILENAME)
  verifyPackagedOpenkododTemplate(resourcesDir)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  let removedBytes = 0
  for (const [target, entry] of Object.entries(manifest.targets)) {
    // Darwin signing rewrites each copy independently; keep their existing signing path.
    if (target.startsWith('darwin-') || entry.packagedRipgrep) {
      continue
    }
    const filename = openkododRipgrepArtifact(target)
    const shared = join(resourcesDir, ...filename.split('/'))
    if (!existsSync(shared)) {
      continue
    }
    const metadata = lstatSync(shared)
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error(`Packaged ripgrep must be a regular file: ${shared}`)
    }
    // A different desktop binary remains separate; only byte-identical payloads may share storage.
    if (sha256(shared) !== entry.files[filename]) {
      continue
    }
    const duplicate = join(
      templateDir,
      OPENKODOD_TEMPLATE_TARGETS_DIR,
      target,
      ...filename.split('/')
    )
    removedBytes += lstatSync(duplicate).size
    unlinkSync(duplicate)
    entry.packagedRipgrep = true
  }
  if (removedBytes > 0) {
    manifest.schemaVersion = 4
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  }
  verifyPackagedOpenkododTemplate(resourcesDir)
  return removedBytes
}

/** Reseal only shared binaries explicitly returned by the Windows signer. */
function resealSignedPackagedRipgrep(resourcesDir, signedResourcePaths) {
  const templateDir = join(resourcesDir, 'openkodod-template')
  const manifestPath = join(templateDir, OPENKODOD_TEMPLATE_MANIFEST_FILENAME)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const signed = new Set(signedResourcePaths)
  for (const [target, entry] of Object.entries(manifest.targets)) {
    const filename = openkododTemplatePackagedRipgrep(
      manifest.schemaVersion,
      target,
      entry.packagedRipgrep
    )
    if (filename?.startsWith('ripgrep/win32-') && signed.has(filename)) {
      entry.files[filename] = sha256(join(resourcesDir, ...filename.split('/')))
    }
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

module.exports = { compactPackagedOpenkododRipgrep, resealSignedPackagedRipgrep }
