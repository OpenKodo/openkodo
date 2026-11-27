import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import {
  isWindowsRemoteHost,
  type RemoteHostPlatform
} from '../../ssh/remote-host/ssh-remote-platform'
import { openkododWindowsHostOpCommand } from '../install/openkodod-remote-windows-node'
import { OPENKODOD_SNAPSHOT_MEMBERS } from './openkodod-state-snapshot-members'

/** Print newest snapshot-member mtime or UNKNOWN; rollback treats unknown state as potentially modified. */
export function newestStateMtimeCommand(
  host: RemoteHostPlatform,
  userDataDir: string,
  baseDir: string
): string {
  if (isWindowsRemoteHost(host)) {
    return openkododWindowsHostOpCommand(host, baseDir, 'state-newest-mtime', [userDataDir])
  }
  const root = quotePosixShell(userDataDir)
  const paths = OPENKODOD_SNAPSHOT_MEMBERS.map(
    (member) => `${root}/${quotePosixShell(member)}`
  ).join(' ')
  return [
    `newest=$(find ${paths} -type f -exec stat -c %Y {} + 2>/dev/null ||`,
    `find ${paths} -type f -exec stat -f %m {} + 2>/dev/null);`,
    'if [ -z "$newest" ]; then echo UNKNOWN; else',
    `echo "$newest" | sort -n | tail -1; fi`
  ].join(' ')
}

export function parseNewestStateMtimeSeconds(output: string): number | null {
  const value = output.trim().split('\n').pop()?.trim()
  if (!value || !/^\d+$/.test(value)) {
    return null
  }
  return Number.parseInt(value, 10)
}
