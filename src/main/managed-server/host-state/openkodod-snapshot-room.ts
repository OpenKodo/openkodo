/** Check snapshot room before stopping a serving incumbent (#30491). */
import { openkododRemoteBaseDir } from '../install/openkodod-remote-windows-node'
import { execOpenkododRemoteOr } from '../install/openkodod-remote-runtime-control'
import {
  OPENKODOD_STATE_SNAPSHOT_DIR,
  type OpenkododActivationRecord
} from '../activation/openkodod-activation-record'
import {
  openkododSnapshotShortfallKb,
  openkododSnapshotShortfallMessage,
  openkododSnapshotSpaceCommand,
  parseOpenkododSnapshotSpace
} from './openkodod-state-snapshot-space'
import { joinRemotePath } from '../../ssh/remote-host/ssh-remote-platform'
import { isUnconfirmedSshCommandTermination } from '../../ssh/remote-exec/remote-exec-command'
import type { OpenkododSlotOptions } from '../activation/openkodod-recovery-slot'

export const OPENKODOD_SNAPSHOT_SPACE_INSUFFICIENT_CODE = 'openkodod_snapshot_space_insufficient'

export function openkododSnapshotsRoot(
  options: Pick<OpenkododSlotOptions, 'host' | 'remoteHome'>
): string {
  return joinRemotePath(
    options.host,
    openkododRemoteBaseDir(options.host, options.remoteHome),
    OPENKODOD_STATE_SNAPSHOT_DIR
  )
}

/** Unknown room proceeds to authoritative capture; return a refusal only for proven insufficient space. */
export async function openkododSnapshotRoomRefusal(
  options: OpenkododSlotOptions,
  record: OpenkododActivationRecord,
  fullVersion: string
): Promise<string | null> {
  const baseDir = openkododRemoteBaseDir(options.host, options.remoteHome)
  const command = openkododSnapshotSpaceCommand(
    options.host,
    options.userDataDir,
    openkododSnapshotsRoot(options),
    baseDir,
    record.snapshot ? [record.snapshot.dirName] : []
  )
  if (!command) {
    return null
  }
  const space = parseOpenkododSnapshotSpace(await measureRoom(options, command))
  const shortfall = openkododSnapshotShortfallKb(space)
  return space && shortfall !== null
    ? openkododSnapshotShortfallMessage(space, shortfall, {
        userDataDir: options.userDataDir,
        baseDir,
        fullVersion,
        active: record.active
      })
    : null
}

async function measureRoom(options: OpenkododSlotOptions, command: string): Promise<string> {
  try {
    return await execOpenkododRemoteOr(options, command)
  } catch (error) {
    // Unconfirmed read-only cleanup leaves room unknown; capture decides, unless caller cancelled.
    if (isUnconfirmedSshCommandTermination(error) && !options.signal?.aborted) {
      return ''
    }
    throw error
  }
}
