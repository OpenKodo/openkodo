/** Whether any process runs from an openkodod slot: its server, or a terminal daemon a candidate spawned there, which outlives the candidate's stop. */
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import { posixProcessArgsShellFunction } from '../../managed-server/install/openkodod-remote-host-support'
import { isOpenkododInstallDirLive } from '../../managed-server/install/openkodod-remote-gc'
import {
  execCommand,
  isUnconfirmedSshCommandTermination
} from '../../ssh/remote-exec/remote-exec-command'
import { joinRemotePath, type RemoteHostPlatform } from '../../ssh/remote-host/ssh-remote-platform'
import type { OpenkododSlotOptions } from '../../managed-server/activation/openkodod-recovery-slot'

// Every shell running this probe carries it in argv, so the probe never counts itself.
const PROBE_MARKER = '__OPENKODO_SLOT_PROCESS_PROBE__'

/** Prints LIVE, DEAD or UNKNOWN; anything unreadable is UNKNOWN. */
export function wslOpenkododSlotProcessProbeCommand(
  host: RemoteHostPlatform,
  slotDir: string,
  userDataDir: string
): string {
  const slot = quotePosixShell(`${slotDir.replace(/\/+$/u, '')}/`)
  const daemonDir = quotePosixShell(joinRemotePath(host, userDataDir, 'daemon'))
  const inSlot =
    'grep -F -e "$openkodod_slot" -e "$openkodod_real/" | ' +
    `grep -vF -- ${PROBE_MARKER} | grep -q .`
  return [
    `openkodod_slot=${slot}; openkodod_ddir=${daemonDir}; : ${PROBE_MARKER};`,
    // Node realpaths its entry, so a daemon behind a symlinked home names the resolved slot.
    'openkodod_real=$(cd "$openkodod_slot" 2>/dev/null && pwd -P) && [ -n "$openkodod_real" ] || { echo UNKNOWN; exit 0; };',
    posixProcessArgsShellFunction(),
    // A live daemon whose pid file names it must be identified, not skipped.
    'for openkodod_df in "$openkodod_ddir"/daemon-v*.pid; do [ -f "$openkodod_df" ] || continue;',
    'openkodod_dp=$(sed -n \'s/.*"pid":\\([0-9][0-9]*\\).*/\\1/p\' "$openkodod_df" | head -n 1);',
    '[ -n "$openkodod_dp" ] || continue; kill -0 "$openkodod_dp" 2>/dev/null || continue;',
    'openkodod_da=$(openkodod_args "$openkodod_dp") || { echo UNKNOWN; exit 0; };',
    `printf '%s\\n' "$openkodod_da" | ${inSlot} && { echo LIVE; exit 0; };`,
    'done;',
    // Capture first so the filters below never list themselves.
    'if openkodod_all=$(ps -ww -eo args= 2>/dev/null) && [ -n "$openkodod_all" ]; then :;',
    'elif [ -r /proc/self/cmdline ]; then',
    'openkodod_all=$(for openkodod_p in /proc/[0-9]*; do tr "\\000" " " < "$openkodod_p/cmdline" 2>/dev/null; echo; done);',
    'else echo UNKNOWN; exit 0; fi;',
    `if printf '%s\\n' "$openkodod_all" | ${inSlot}; then echo LIVE; else echo DEAD; fi`
  ].join(' ')
}

/** True unless both the server's pid file and a process scan prove nothing runs from the slot. */
export async function isWslOpenkododSlotInUse(
  slot: OpenkododSlotOptions,
  slotDir: string
): Promise<boolean> {
  if (await isOpenkododInstallDirLive(slot, slotDir)) {
    return true
  }
  try {
    const answer = await execCommand(
      slot.conn,
      wslOpenkododSlotProcessProbeCommand(slot.host, slotDir, slot.userDataDir),
      { wrapCommand: true, signal: slot.signal }
    )
    return answer.trim().split('\n').at(-1)?.trim() !== 'DEAD'
  } catch (error) {
    if (isUnconfirmedSshCommandTermination(error)) {
      throw error
    }
    return true
  }
}
