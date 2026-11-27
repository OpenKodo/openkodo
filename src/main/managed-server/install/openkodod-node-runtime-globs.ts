import {
  OPENKODOD_NODE_RUNTIME_DIR_PREFIX,
  OPENKODOD_NODE_RUNTIME_POSIX_EXECUTABLE,
  OPENKODOD_RUNTIMES_DIRNAME
} from '../../../shared/remote-runtime/openkodod-distribution/openkodod-artifacts'
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import { RELAY_REMOTE_DIR } from './remote-install-root'
import { OPENKODOD_MACHINE_HOMES_DIRNAME } from '../host-state/openkodod-machine-home'

/** POSIX shell glob words for openkodod's pinned Node runtimes; machine homes may hold other architectures, so callers must self-test each match. */
export function openkododPosixNodeRuntimeGlobs(): [string, string] {
  const store = `${RELAY_REMOTE_DIR}/${OPENKODOD_RUNTIMES_DIRNAME}/${OPENKODOD_NODE_RUNTIME_DIR_PREFIX}`
  const executable = `/${OPENKODOD_NODE_RUNTIME_POSIX_EXECUTABLE}`
  const machineStores = `${RELAY_REMOTE_DIR}/${OPENKODOD_MACHINE_HOMES_DIRNAME}/`
  return [
    `"$HOME"/${quotePosixShell(store)}*${quotePosixShell(executable)}`,
    `"$HOME"/${quotePosixShell(machineStores)}*/${quotePosixShell(store)}*${quotePosixShell(executable)}`
  ]
}
