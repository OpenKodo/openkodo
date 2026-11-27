import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { access, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { createElectronHomeIsolation } from '../electron-fixtures/electron-home-isolation'

const execFileAsync = promisify(execFile)
const RUNTIME_METADATA_FILE = 'openkodo-runtime.json'
let openkodoDevUserDataPath: string | null = null
let openkodoServeProcess: ChildProcess | null = null
let openkodoServeStdout = ''
let openkodoServeStderr = ''

export type CliResult = {
  stdout: string
  stderr: string
}

type RunOpenKodoCliOptions = {
  retryMissingRuntimeMetadata?: boolean
}

export async function runOpenKodoCli(
  args: string[],
  options: RunOpenKodoCliOptions = {}
): Promise<CliResult> {
  try {
    return await runOpenKodoCliOnce(args)
  } catch (error) {
    if (
      options.retryMissingRuntimeMetadata !== false &&
      isMissingRuntimeMetadataError(args, error)
    ) {
      // Windows can lose the dev runtime while launching the fixture app; reopen once before the desktop action.
      await ensureOpenKodoRuntimeLaunched()
      return await runOpenKodoCliOnce(args)
    }
    throw error
  }
}

async function runOpenKodoCliOnce(args: string[]): Promise<CliResult> {
  const devCli = join(process.cwd(), 'config/scripts/development/launch/openkodo-dev.mjs')
  const command = process.env.OPENKODO_COMPUTER_CLI ?? process.execPath
  const cliArgs = process.env.OPENKODO_COMPUTER_CLI ? args : [devCli, ...args]
  const env = process.env.OPENKODO_COMPUTER_CLI
    ? { ...process.env }
    : await createComputerE2ERuntimeEnv()
  try {
    const result = await execFileAsync(command, cliArgs, {
      env,
      maxBuffer: 20 * 1024 * 1024
    })
    return { stdout: result.stdout, stderr: result.stderr }
  } catch (error) {
    if (error && typeof error === 'object' && 'stdout' in error && 'stderr' in error) {
      const output = error as { message: string; stdout: string; stderr: string }
      throw new Error(`${output.message}\nstdout:\n${output.stdout}\nstderr:\n${output.stderr}`)
    }
    throw error
  }
}

export async function ensureOpenKodoRuntimeLaunched(): Promise<void> {
  if (!process.env.OPENKODO_COMPUTER_CLI && process.platform === 'win32') {
    await ensureOpenKodoRuntimeServed()
    return
  }
  await runOpenKodoCli(['open', '--json'], { retryMissingRuntimeMetadata: false })
  await waitForOpenKodoRuntimeReady()
}

export async function stopOpenKodoRuntime(): Promise<void> {
  const processToStop = openkodoServeProcess
  if (!processToStop?.pid) {
    return
  }
  openkodoServeProcess = null
  if (process.platform === 'win32') {
    try {
      await execFileAsync('taskkill.exe', ['/PID', String(processToStop.pid), '/T', '/F'])
    } catch {
      // The foreground test runtime may already have exited.
    }
    return
  }
  processToStop.kill()
}

export function parseJsonOutput<T>(stdout: string): T {
  return JSON.parse(stdout) as T
}

async function getComputerE2eOpenKodoDevUserDataPath(): Promise<string> {
  if (!openkodoDevUserDataPath) {
    // Use a fresh profile so a retained dev runtime cannot execute stale provider code.
    openkodoDevUserDataPath = await mkdtemp(join(tmpdir(), 'openkodo-computer-runtime-'))
  }
  return openkodoDevUserDataPath
}

async function waitForOpenKodoRuntimeReady(): Promise<void> {
  const userDataPath = await getComputerE2eOpenKodoDevUserDataPath()
  const metadataPath = join(userDataPath, RUNTIME_METADATA_FILE)
  const deadline = Date.now() + 15000
  let lastError: unknown = null

  while (Date.now() < deadline) {
    try {
      await access(metadataPath)
      const status = parseJsonOutput<{
        result: { runtime: { reachable: boolean } }
      }>(
        (await runOpenKodoCli(['status', '--json'], { retryMissingRuntimeMetadata: false })).stdout
      )
      if (status.result.runtime.reachable) {
        return
      }
    } catch (error) {
      lastError = error
    }
    await delay(250)
  }

  const detail = [
    lastError instanceof Error ? `Last error: ${lastError.message}` : null,
    openkodoServeStdout.trim() ? `serve stdout: ${openkodoServeStdout.trim()}` : null,
    openkodoServeStderr.trim() ? `serve stderr: ${openkodoServeStderr.trim()}` : null
  ]
    .filter(Boolean)
    .join(' ')
  throw new Error(`OpenKodo runtime metadata was not ready at ${metadataPath}.${detail}`)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function ensureOpenKodoRuntimeServed(): Promise<void> {
  if (!openkodoServeProcess || openkodoServeProcess.exitCode !== null) {
    const devCli = join(process.cwd(), 'config/scripts/development/launch/openkodo-dev.mjs')
    const env = await createComputerE2ERuntimeEnv()
    openkodoServeStdout = ''
    openkodoServeStderr = ''
    openkodoServeProcess = spawn(process.execPath, [devCli, 'serve', '--no-pairing', '--json'], {
      env,
      windowsHide: true
    })
    openkodoServeProcess.stdout?.on('data', (chunk) => {
      openkodoServeStdout += String(chunk)
    })
    openkodoServeProcess.stderr?.on('data', (chunk) => {
      openkodoServeStderr += String(chunk)
    })
    openkodoServeProcess.once('exit', () => {
      openkodoServeProcess = null
    })
    process.once('exit', () => {
      openkodoServeProcess?.kill()
    })
  }
  await waitForOpenKodoRuntimeReady()
}

async function createComputerE2ERuntimeEnv(): Promise<NodeJS.ProcessEnv> {
  const userDataDir =
    process.env.OPENKODO_DEV_USER_DATA_PATH ?? (await getComputerE2eOpenKodoDevUserDataPath())
  // Strip ELECTRON_RUN_AS_NODE or the Electron child runs as plain Node.
  const { ELECTRON_RUN_AS_NODE: _electronRunAsNode, ...inheritedEnv } = process.env
  void _electronRunAsNode
  const isolation = createElectronHomeIsolation({
    inheritedEnv,
    launchEnv: {},
    extraEnv: {},
    userDataDir
  })
  return {
    ...isolation.env,
    // Keep CLI and Electron on the same runtime metadata while fixture HOME/Codex isolation remains in force.
    OPENKODO_DEV_USER_DATA_PATH: userDataDir
  }
}

function isMissingRuntimeMetadataError(args: string[], error: unknown): boolean {
  if (args[0] !== 'computer') {
    return false
  }
  if (!error || typeof error !== 'object' || !('message' in error)) {
    return false
  }
  const message = String((error as { message?: unknown }).message)
  return (
    message.includes('"code": "runtime_unavailable"') &&
    message.includes('Could not read OpenKodo runtime metadata')
  )
}
