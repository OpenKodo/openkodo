/** macOS pins Local Network attribution at spawn: SSH-launched terminals can lose LAN access after sshd-session exits (#25934; Apple TN3179). Record the nearest session plus start time and matching slot PID; preserve earlier attribution while a live terminal daemon survives openkodod restarts. */
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import { joinRemotePath, type RemoteHostPlatform } from '../../ssh/remote-host/ssh-remote-platform'
import { OPENKODOD_PID_FILENAME } from './openkodod-remote-host-support'

export const OPENKODOD_LAUNCH_SSH_SESSION_FILENAME = '.openkodod-launch-ssh-session'

const LOCAL_NETWORK_PRIVACY_MAJOR = 15
// Bounds the ancestor walk; real chains are a few processes deep.
const MAX_ANCESTOR_DEPTH = 32

export function recordsOpenkododLaunchSshSession(host: RemoteHostPlatform): boolean {
  return host.os === 'darwin'
}

/** Choose the nearest sshd ancestor, which exits with this session; a listener farther up would remain alive. */
export function openkododSshSessionAncestorShellFunction(): string {
  return (
    'openkodod_ssh_session() { openkodod_sp=$1; openkodod_si=0; ' +
    `while [ "$openkodod_si" -lt ${MAX_ANCESTOR_DEPTH} ]; do ` +
    'case "$openkodod_sp" in "" | *[!0-9]* | 0 | 1) return 1;; esac; ' +
    'openkodod_sc=$(ps -o comm= -p "$openkodod_sp" 2>/dev/null) || return 1; ' +
    'case "${openkodod_sc##*/}" in sshd*) ' +
    'openkodod_ss=$(ps -o lstart= -p "$openkodod_sp" 2>/dev/null) || return 1; ' +
    // Why unquoted: normalizes lstart's padding so a later read compares equal.
    'echo "$openkodod_sp" $openkodod_ss; return 0;; esac; ' +
    'openkodod_sp=$(ps -o ppid= -p "$openkodod_sp" 2>/dev/null | tr -d " "); ' +
    'openkodod_si=$((openkodod_si + 1)); done; return 1; };'
  )
}

/** Capture before detach without failing launch. */
export function captureOpenkododLaunchSshSessionCommand(): string {
  return (
    `${openkododSshSessionAncestorShellFunction()} ` +
    'openkodod_session=$(openkodod_ssh_session "$$" 2>/dev/null) || openkodod_session=;'
  )
}

function recordPath(host: RemoteHostPlatform, userDataDir: string): string {
  return quotePosixShell(joinRemotePath(host, userDataDir, OPENKODOD_LAUNCH_SSH_SESSION_FILENAME))
}

/** Return 0 for this root's live daemon, 1 for absence, 2 for unreadable argv; PID files alone may name recycled processes. */
function liveDaemonShellFunction(host: RemoteHostPlatform, userDataDir: string): string {
  const daemonDir = quotePosixShell(joinRemotePath(host, userDataDir, 'daemon'))
  return (
    `openkodod_daemon_live() { openkodod_ddir=${daemonDir}; for openkodod_df in "$openkodod_ddir"/daemon-v*.pid; do ` +
    '[ -f "$openkodod_df" ] || continue; ' +
    'openkodod_dp=$(sed -n \'s/.*"pid":\\([0-9][0-9]*\\).*/\\1/p\' "$openkodod_df" | head -n 1); ' +
    '[ -n "$openkodod_dp" ] || continue; ' +
    'kill -0 "$openkodod_dp" 2>/dev/null || continue; ' +
    'openkodod_da=$(ps -o args= -p "$openkodod_dp" 2>/dev/null); [ -n "$openkodod_da" ] || return 2; ' +
    'case "$openkodod_da" in *daemon-entry*"$openkodod_ddir"* | *"$openkodod_ddir"*daemon-entry*) return 0;; esac; ' +
    'done; return 1; };'
  )
}

/** After recording $!, preserve the live daemon's earlier session; otherwise record this launch's session. */
export function writeOpenkododLaunchSshSessionCommand(
  host: RemoteHostPlatform,
  userDataDir: string
): string {
  const file = recordPath(host, userDataDir)
  return (
    // First-deploy detach may run before openkodod creates its data root.
    `{ openkodod_bg=$!; ( umask 077; mkdir -p ${quotePosixShell(userDataDir)} ); ` +
    `${liveDaemonShellFunction(host, userDataDir)} ` +
    'openkodod_daemon_live; openkodod_dl=$?; ' +
    'if [ "$openkodod_dl" = 0 ]; then ' +
    `openkodod_prev=$(cat ${file}); rm -f ${file}; set -- $openkodod_prev; ` +
    `[ "$#" -lt 3 ] || { shift; ( umask 077; echo "$openkodod_bg" "$@" > ${file} ); }; ` +
    // Unreadable daemon identity leaves attribution unknown, never assigned to this launch.
    `elif [ "$openkodod_dl" = 2 ]; then rm -f ${file}; ` +
    `else rm -f ${file}; [ -z "$openkodod_session" ] || ` +
    `( umask 077; echo "$openkodod_bg" $openkodod_session > ${file} ); fi; :; } 2>/dev/null`
  )
}

export function openkododLaunchSshSessionProbeCommand(
  host: RemoteHostPlatform,
  remoteInstallDir: string,
  userDataDir: string
): string {
  const file = recordPath(host, userDataDir)
  const pidFile = quotePosixShell(joinRemotePath(host, remoteInstallDir, OPENKODOD_PID_FILENAME))
  return [
    'openkodod_mac=$(sw_vers -productVersion 2>/dev/null) || { echo NOT_APPLICABLE; exit 0; };',
    'openkodod_major=${openkodod_mac%%.*};',
    'case "$openkodod_major" in "" | *[!0-9]*) echo UNVERIFIABLE; exit 0;; esac;',
    `[ "$openkodod_major" -ge ${LOCAL_NETWORK_PRIVACY_MAJOR} ] || { echo NOT_APPLICABLE; exit 0; };`,
    `openkodod_rec=$(cat ${file} 2>/dev/null) || { echo NOT_RECORDED; exit 0; };`,
    `openkodod_pid=$(cat ${pidFile} 2>/dev/null);`,
    'set -- $openkodod_rec;',
    'case "$1:$2" in *[!0-9:]* | :* | *:) echo NOT_RECORDED; exit 0;; esac;',
    '[ "$1" = "$openkodod_pid" ] || { echo NOT_RECORDED; exit 0; };',
    'openkodod_sshd=$2; shift 2; openkodod_want=$*;',
    // A ps that can't list this shell can't prove another process absent.
    'ps -o pid= -p "$$" >/dev/null 2>&1 || { echo UNVERIFIABLE; exit 0; };',
    'openkodod_now=$(ps -o lstart= -p "$openkodod_sshd" 2>/dev/null); openkodod_now=$(echo $openkodod_now);',
    // A reused PID with another start time is a different process: the session is gone.
    'if [ -z "$openkodod_now" ] || [ "$openkodod_now" != "$openkodod_want" ]; then echo EXITED; else echo LIVE; fi'
  ].join(' ')
}

/** `not-recorded` covers older launches and clients: the condition is unknown, never assumed. */
export type OpenkododLaunchSshSession =
  | 'live'
  | 'exited'
  | 'unverifiable'
  | 'not-recorded'
  | 'not-applicable'

export function parseOpenkododLaunchSshSession(output: string): OpenkododLaunchSshSession {
  switch (output.trim().split('\n').pop()?.trim() ?? '') {
    case 'LIVE':
      return 'live'
    case 'EXITED':
      return 'exited'
    case 'NOT_RECORDED':
      return 'not-recorded'
    case 'NOT_APPLICABLE':
      return 'not-applicable'
    default:
      return 'unverifiable'
  }
}
