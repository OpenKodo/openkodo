/**
 * WSL reads an active slot's liveness, readiness and pid in one guest command; SSH keeps
 * `probeActiveOpenkododReadiness`'s separate reads. The answers are judged exactly as those are.
 */
import type { OpenkododHostTarget } from '../../managed-server/install/openkodod-host-transport'
import type { OpenkododRemoteContext } from '../../managed-server/install/openkodod-remote-context'
import { openkododLivenessProbeCommand } from '../../managed-server/install/openkodod-remote-launch'
import { readOpenkododReadinessNowCommand } from '../../managed-server/install/openkodod-remote-readiness-wait'
import { execOpenkododRemote } from '../../managed-server/install/openkodod-remote-runtime-control'
import { OPENKODOD_PID_FILENAME } from '../../managed-server/install/openkodod-remote-host-support'
import { managedOpenkododInstallDir } from '../../managed-server/lifecycle/openkodod-managed-runtime-context'
import {
  activeOpenkododReadinessFromOutput,
  assertActiveOpenkododLive,
  OpenkododActiveReadinessError
} from '../../managed-server/activation/openkodod-active-readiness'
import { computeLocalOpenkododBuildHash } from '../../managed-server/install/openkodod-local-build-hash'
import type { ServeReadiness } from '../../server/serve-readiness'
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import { OPENKODOD_WSL_HOST_ENV } from '../../../shared/remote-runtime/serve-supervisor/openkodod-server-launch-env'
import { execCommand } from '../../ssh/remote-exec/remote-exec-command'
import { joinRemotePath } from '../../ssh/remote-host/ssh-remote-platform'

const SECTION_END = '__OPENKODO_WSL_ACTIVE_PROBE_END__'
const WSL_HOST_LAUNCH = '__OPENKODO_WSL_HOST_LAUNCH__'
const OTHER_LAUNCH = '__OPENKODO_OTHER_LAUNCH__'

/**
 * How the serving openkodod was started: by a WSL host (it carries the marker), some other way
 * (usually an SSH host pointed at the distro, #43632), or unknown when its environment is unreadable.
 */
export type WslOpenkododLaunchMode = 'wsl-host' | 'other' | 'unknown'

type WslContext = OpenkododRemoteContext<OpenkododHostTarget>

function pidFile(context: WslContext, fullVersion: string): string {
  return quotePosixShell(
    joinRemotePath(
      context.host,
      managedOpenkododInstallDir(context, fullVersion),
      OPENKODOD_PID_FILENAME
    )
  )
}

function pidCommand(context: WslContext, fullVersion: string): string {
  return `cat ${pidFile(context, fullVersion)} 2>/dev/null || true`
}

/**
 * The readiness file says nothing of the launch, so read the process's own environment. An
 * unreadable or empty one (another user's process, a kernel thread) prints nothing: unknown.
 */
function launchModeCommand(context: WslContext, fullVersion: string): string {
  return (
    `openkodod_lp=$(cat ${pidFile(context, fullVersion)} 2>/dev/null); case "$openkodod_lp" in "" | *[!0-9]*) ;; ` +
    `*) openkodod_le=$(tr '\\0' '\\n' 2>/dev/null < "/proc/$openkodod_lp/environ"); ` +
    `if [ -n "$openkodod_le" ]; then if printf '%s\\n' "$openkodod_le" | ` +
    `grep -qx ${quotePosixShell(`${OPENKODOD_WSL_HOST_ENV}=1`)}; then echo ${WSL_HOST_LAUNCH}; ` +
    `else echo ${OTHER_LAUNCH}; fi; fi;; esac`
  )
}

function parseLaunchMode(output: string): WslOpenkododLaunchMode {
  // A pid file without its newline runs the pid and the answer together.
  return output.includes(WSL_HOST_LAUNCH)
    ? 'wsl-host'
    : output.includes(OTHER_LAUNCH)
      ? 'other'
      : 'unknown'
}

function parsePid(output: string): number | null {
  const pid = Number.parseInt(output, 10)
  return Number.isSafeInteger(pid) && pid > 0 ? pid : null
}

export async function readWslOpenkododPid(
  context: WslContext,
  fullVersion: string,
  signal?: AbortSignal
): Promise<number | null> {
  return parsePid(
    await execCommand(context.connection, pidCommand(context, fullVersion), { signal })
  )
}

/** Each section ends with a marker on its own line; the newline before it is the probe's own. */
export function wslOpenkododActiveProbeCommand(context: WslContext, fullVersion: string): string {
  const installDir = managedOpenkododInstallDir(context, fullVersion)
  const end = `printf '\\n%s\\n' ${SECTION_END}`
  return [
    openkododLivenessProbeCommand(context.host, installDir),
    end,
    readOpenkododReadinessNowCommand(context.host, installDir),
    end,
    pidCommand(context, fullVersion),
    // Same section as the pid: parsePid reads only its first number.
    launchModeCommand(context, fullVersion)
  ].join('\n')
}

export async function probeWslActiveOpenkodod(
  context: WslContext,
  localOpenkododDir: string,
  fullVersion: string,
  signal?: AbortSignal
): Promise<{ readiness: ServeReadiness; pid: number | null; launch: WslOpenkododLaunchMode }> {
  const output = await execOpenkododRemote(
    { conn: context.connection, host: context.host, signal },
    wslOpenkododActiveProbeCommand(context, fullVersion)
  )
  const sections = output.split(`\n${SECTION_END}\n`)
  if (sections.length !== 3) {
    throw new OpenkododActiveReadinessError(
      'unverifiable',
      `openkodod ${fullVersion} process state is unverifiable.`
    )
  }
  const [liveness = '', readiness = '', pid = ''] = sections
  const expectation = { buildHash: computeLocalOpenkododBuildHash(localOpenkododDir), fullVersion }
  assertActiveOpenkododLive(liveness, expectation)
  return {
    readiness: activeOpenkododReadinessFromOutput(context.host, readiness, expectation),
    pid: parsePid(pid),
    launch: parseLaunchMode(pid)
  }
}
