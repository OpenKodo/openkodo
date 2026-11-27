import {
  OPENKODOD_BUILD_TARGET_FILENAME,
  OPENKODOD_LAUNCHER_FILENAME,
  OPENKODOD_SERVER_ENTRY_FILENAME,
  OPENKODOD_NODE_RUNTIME_DIR_PREFIX,
  OPENKODOD_NODE_RUNTIME_MARKER_FILENAME,
  OPENKODOD_NODE_RUNTIME_POSIX_EXECUTABLE,
  OPENKODOD_RUNTIMES_DIRNAME,
  openkododBunRuntimeFilename
} from '../../../shared/remote-runtime/openkodod-distribution/openkodod-artifacts'
import { assertPosixOpenkododHost } from './openkodod-remote-host-support'
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import { joinRemotePath, type RemoteHostPlatform } from '../../ssh/remote-host/ssh-remote-platform'

// Assign the long slot path once to reduce command size on the wire.
function assignOpenkododSlot(directory: string): string {
  return `openkodod_slot=${quotePosixShell(directory.replace(/\/+$/, ''))}; `
}

// Rollback must still accept legacy single-entry slots.
export function selectOpenkododSlotEntryCommand(
  host: RemoteHostPlatform,
  directory: string
): string {
  assertPosixOpenkododHost(host)
  const server = `"$openkodod_slot"/${quotePosixShell(OPENKODOD_SERVER_ENTRY_FILENAME)}`
  const launcher = `"$openkodod_slot"/${quotePosixShell(OPENKODOD_LAUNCHER_FILENAME)}`
  return `${assignOpenkododSlot(directory)}if [ -f ${server} ]; then openkodod_entry=${server}; else openkodod_entry=${launcher}; fi`
}

/** Set $openkodod_runtime or exit 78; callers decide what an absent marker means. */
export function openkododNodeSlotRuntimeCommand(
  host: RemoteHostPlatform,
  directory: string
): string {
  assertPosixOpenkododHost(host)
  const nodeMarker = `"$openkodod_slot"/${quotePosixShell(OPENKODOD_NODE_RUNTIME_MARKER_FILENAME)}`
  const nodeRuntimePrefix = `"\${openkodod_slot%/*}"/${quotePosixShell(
    `${OPENKODOD_RUNTIMES_DIRNAME}/${OPENKODOD_NODE_RUNTIME_DIR_PREFIX}`
  )}`
  const nodeExecutable = quotePosixShell(`/${OPENKODOD_NODE_RUNTIME_POSIX_EXECUTABLE}`)
  return (
    `${assignOpenkododSlot(directory)}openkodod_node_sha=$(cat ${nodeMarker}) || exit 78; ` +
    // The digest becomes a path segment; reject non-SHA256 values.
    // Leading ( keeps the case pattern parseable inside command substitution.
    'case "$openkodod_node_sha" in ("" | *[!0-9a-f]*) exit 78;; esac; ' +
    '[ "${#openkodod_node_sha}" -eq 64 ] || exit 78; ' +
    `openkodod_runtime=${nodeRuntimePrefix}"$openkodod_node_sha"${nodeExecutable}; ` +
    '[ -x "$openkodod_runtime" ] || exit 78; '
  )
}

/** Keeps address space small under RLIMIT_AS: undici's WASM memory otherwise reserves 4-9 GiB (#37538).
 * Caps any WASM memory in openkodod at 64 MiB. Pinned Node only: older host Node rejects the flag. */
const OPENKODOD_PINNED_NODE_FLAGS = '--disable-wasm-trap-handler --wasm-max-mem-pages=1024'

/** Also sets $openkodod_runtime_flags. Legacy host Node fallback must never hide an incomplete Node or Bun slot. */
export function selectOpenkododSlotRuntimeCommand(
  host: RemoteHostPlatform,
  directory: string,
  legacyNodePath: string
): string {
  assertPosixOpenkododHost(host)
  const nodeMarker = quotePosixShell(
    joinRemotePath(host, directory, OPENKODOD_NODE_RUNTIME_MARKER_FILENAME)
  )
  const runtime = quotePosixShell(
    joinRemotePath(host, directory, openkododBunRuntimeFilename(host.os))
  )
  const target = quotePosixShell(joinRemotePath(host, directory, OPENKODOD_BUILD_TARGET_FILENAME))
  return (
    // One compound command: launch chains it with && after cd.
    `if [ -e ${nodeMarker} ]; then ${openkododNodeSlotRuntimeCommand(host, directory)}` +
    `openkodod_runtime_flags=${quotePosixShell(OPENKODOD_PINNED_NODE_FLAGS)}; ` +
    `elif [ -e ${target} ] || [ -e ${runtime} ]; then ` +
    `[ -x ${runtime} ] || exit 78; openkodod_runtime=${runtime}; openkodod_runtime_flags=; ` +
    `else openkodod_runtime=${quotePosixShell(legacyNodePath)}; openkodod_runtime_flags=; fi`
  )
}
