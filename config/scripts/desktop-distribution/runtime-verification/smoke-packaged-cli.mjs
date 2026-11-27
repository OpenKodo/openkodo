import { cp, mkdtemp, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import assert from 'node:assert/strict'

const execFileAsync = promisify(execFile)

function readAppDirArg(argv) {
  const explicit = argv.find((arg) => arg.startsWith('--app-dir='))
  if (explicit) {
    return explicit.slice('--app-dir='.length)
  }
  if (process.platform === 'darwin') {
    return 'dist/mac-arm64/OpenKodo.app'
  }
  if (process.platform === 'win32') {
    return 'dist/win-unpacked'
  }
  return 'dist/linux-unpacked'
}

function getPackagedCliPath(appDir) {
  if (process.platform === 'darwin' || appDir.endsWith('.app')) {
    return join(appDir, 'Contents', 'Resources', 'bin', 'openkodo')
  }
  if (process.platform === 'win32') {
    return join(appDir, 'resources', 'bin', 'openkodo.exe')
  }
  return join(appDir, 'resources', 'bin', 'openkodo')
}

const appDir = resolve(readAppDirArg(process.argv.slice(2)))
const tempRoot = await mkdtemp(join(tmpdir(), 'openkodo-packaged-cli-smoke-'))
const copiedAppDir = join(tempRoot, basename(appDir))

let smokeFailure = null
try {
  await cp(appDir, copiedAppDir, { recursive: true, verbatimSymlinks: true })
  const cliPath = getPackagedCliPath(copiedAppDir)
  const env = { ...process.env, NODE_PATH: '' }
  delete env.OPENKODO_CLI_CWD
  const run = (args) =>
    execFileAsync(cliPath, args, {
      env,
      killSignal: 'SIGKILL',
      maxBuffer: 16 * 1024 * 1024,
      timeout: 30_000
    })

  const [
    ,
    listResult,
    openkodoCliResult,
    openkodoComputerUseResult,
    computerUseResult,
    installResult,
    updateResult
  ] = await Promise.all([
    run(['--help']),
    run(['skills', 'list', '--json']),
    run(['skills', 'get', 'openkodo-cli']),
    run(['skills', 'get', 'openkodo-computer-use']),
    run(['skills', 'get', 'computer-use']),
    run([
      'skills',
      'install',
      '--skill',
      'openkodo-cli',
      '--agent',
      'codex',
      '--dry-run',
      '--json'
    ]),
    run(['skills', 'update', '--skill', 'openkodo-cli', '--dry-run', '--json'])
  ])
  const list = JSON.parse(listResult.stdout)
  assert(list.topics.some((topic) => topic.name === 'openkodo-cli'))
  assert.match(openkodoCliResult.stdout, /name: openkodo-cli/)
  assert.match(openkodoComputerUseResult.stdout, /name: openkodo-computer-use/)
  assert.match(computerUseResult.stdout, /name: openkodo-computer-use/)
  const install = JSON.parse(installResult.stdout)
  const update = JSON.parse(updateResult.stdout)
  assert.equal(install.executed, false)
  assert.equal(update.executed, false)
  console.log(`[packaged-cli-smoke] help and skills commands passed via ${cliPath}`)
} catch (error) {
  smokeFailure = error
}

// Retry Windows cleanup locks from just-exited OpenKodo.exe/crashpad descendants; persistent lock still throws unless it would mask smoke’s original failure.
const cleanupFailure = await rm(tempRoot, {
  recursive: true,
  force: true,
  maxRetries: 20,
  retryDelay: 250
}).then(
  () => null,
  (error) => error
)

if (smokeFailure) {
  if (cleanupFailure) {
    console.warn(`[packaged-cli-smoke] temp cleanup failed: ${cleanupFailure.message}`)
  }
  throw smokeFailure
}
if (cleanupFailure) {
  throw cleanupFailure
}
