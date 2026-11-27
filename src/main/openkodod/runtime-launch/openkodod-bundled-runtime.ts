import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { constants } from 'node:os'
import { spawnProcess } from '@openkodo/process-host'
import { resolveOpenkododInstallRoot } from '../host-runtime/openkodod-app-paths'
import { OPENKODOD_EXIT_CONFIGURATION } from '../serve-startup/openkodod-configuration-exit'
import {
  OPENKODOD_NODE_RUNTIME_MARKER_FILENAME,
  OPENKODOD_SERVER_TARGET_FILENAME,
  OPENKODOD_VERSION_FILENAME,
  openkododNodeRuntimeRelativePath
} from '../../../shared/remote-runtime/openkodod-distribution/openkodod-artifacts'
import { NODE_RUNTIME_PIN, nodeRuntimeAsset } from '../../../shared/node-runtime/node-runtime-pin'

export class OpenkododBundledRuntimeError extends Error {}
export const OPENKODOD_BUNDLED_LAUNCHER_ENV = 'OPENKODO_BUNDLED_LAUNCHER_CHANNEL'

/** Null for unpackaged entries; reject torn/foreign runtime references in packaged slots. */
export function resolveBundledOpenkododRuntime(directory: string): string | null {
  const markerPath = join(directory, OPENKODOD_NODE_RUNTIME_MARKER_FILENAME)
  const targetPath = join(directory, OPENKODOD_SERVER_TARGET_FILENAME)
  const hasMarker = existsSync(markerPath)
  const hasTarget = existsSync(targetPath)
  if (!hasMarker && !hasTarget && !existsSync(join(directory, OPENKODOD_VERSION_FILENAME))) {
    return null
  }
  if (!hasTarget) {
    throw new OpenkododBundledRuntimeError('The bundled OpenKodo runtime target is missing')
  }
  if (!hasMarker) {
    throw new OpenkododBundledRuntimeError('The bundled OpenKodo runtime reference is missing')
  }
  const target = readFileSync(targetPath, 'utf8').trim()
  // Compat targets use the same Node version built for older glibc.
  const asset = nodeRuntimeAsset(target)
  if (!asset) {
    throw new OpenkododBundledRuntimeError(
      `The bundled OpenKodo runtime target is invalid: ${target}`
    )
  }
  const executableSha256 = readFileSync(markerPath, 'utf8').trim()
  // Validate the exact runtime pin: this marker becomes a path segment.
  if (executableSha256 !== asset.executableSha256) {
    throw new OpenkododBundledRuntimeError(
      `The bundled OpenKodo runtime reference does not name Node ${NODE_RUNTIME_PIN.version}`
    )
  }
  const runtime = join(directory, ...openkododNodeRuntimeRelativePath(target, executableSha256))
  if (!existsSync(runtime)) {
    throw new OpenkododBundledRuntimeError('The bundled OpenKodo runtime is missing')
  }
  return runtime
}

export function resolveBundledOpenkododSlot(script = process.argv[1]): string {
  return resolveOpenkododInstallRoot(script && realpathSync(script))
}

export function isRunningAsBundledOpenkododRuntime(directory: string): boolean {
  const runtime = resolveBundledOpenkododRuntime(directory)
  return runtime !== null && realpathSync(process.execPath) === realpathSync(runtime)
}

/** Reject substituted runtimes before opening profile state. */
export function assertOpenkododServerRuntime(): void {
  if (Number(process.versions.node.split('.')[0]) < 24) {
    throw new OpenkododBundledRuntimeError('The OpenKodo server requires Node.js 24 or newer')
  }
  const directory = resolveBundledOpenkododSlot()
  const runtime = resolveBundledOpenkododRuntime(directory)
  if (runtime && !isRunningAsBundledOpenkododRuntime(directory)) {
    throw new OpenkododBundledRuntimeError(
      'Start the OpenKodo server with its bundled Node.js runtime'
    )
  }
  if (runtime && process.versions.node !== NODE_RUNTIME_PIN.version) {
    throw new OpenkododBundledRuntimeError(
      `The bundled OpenKodo runtime must be Node ${NODE_RUNTIME_PIN.version}`
    )
  }
}

/** Hand old service commands to pinned Node before they can open profile state. */
export function handoffToBundledOpenkodod(): boolean {
  const script = process.argv[1]
  if (!script) {
    return false
  }
  const entry = realpathSync(script)
  const runtime = resolveBundledOpenkododRuntime(dirname(entry))
  if (!runtime) {
    return false
  }
  if (realpathSync(process.execPath) === realpathSync(runtime)) {
    if (process.versions.node !== NODE_RUNTIME_PIN.version) {
      throw new OpenkododBundledRuntimeError(
        `The bundled OpenKodo runtime must be Node ${NODE_RUNTIME_PIN.version}`
      )
    }
    return false
  }
  const child = spawnProcess({
    program: runtime,
    args: [entry, ...process.argv.slice(2)],
    env: { ...process.env, [OPENKODOD_BUNDLED_LAUNCHER_ENV]: '1' },
    // Detach so Windows child jobs cannot kill the runtime before launcher-disconnect cleanup.
    detached: true,
    stdio: ['inherit', 'inherit', 'inherit', 'ipc']
  })
  // Node resets nohup; stop through INT/TERM or owner loss instead.
  const ignoreHangup = (): void => {}
  if (process.platform !== 'win32') {
    process.on('SIGHUP', ignoreHangup)
  }
  const forwards = (['SIGINT', 'SIGTERM'] as const).map((signal) => {
    const forward = (): void => {
      if (process.platform === 'win32') {
        // Detached Windows children have their own console; disconnect allows durable shutdown.
        if (child.connected) {
          child.disconnect()
        }
      } else {
        child.kill(signal)
      }
    }
    process.on(signal, forward)
    return { signal, forward }
  })
  const cleanup = (): void => {
    process.off('SIGHUP', ignoreHangup)
    for (const { signal, forward } of forwards) {
      process.off(signal, forward)
    }
  }
  child.once('error', (error) => {
    cleanup()
    console.error('openkodod: could not start the bundled runtime:', error.message)
    process.exit(OPENKODOD_EXIT_CONFIGURATION)
  })
  child.once('exit', (code, signal) => {
    cleanup()
    if (signal && process.platform !== 'win32') {
      process.kill(process.pid, signal)
      return
    }
    process.exit(code ?? (signal ? 128 + constants.signals[signal] : 1))
  })
  return true
}
