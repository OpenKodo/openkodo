import process from 'node:process'
import { profileStateAccessMachineIdentity } from '../../persistence/profile-state/access/profile-state-access-identity'
import { readOpenkododProcessIncarnation } from './openkodod-process-start-time'
import { OpenkododInstanceLockError } from './openkodod-data-root-privacy'
import {
  openkododCloneMachineHint,
  openkododPeerIsLiveCloneMachine
} from './openkodod-lock-clone-machine'
import {
  openkododStaleLockReclaimCommand,
  type OpenkododReclaimHintRuntime
} from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-stale-lock-reclaim'

/** Match machine identity, then legacy boot identity; identity-less records require local-only storage. */
export function openkododLockHolderLocality(
  holder: OpenkododPeerMachine,
  self: OpenkododPeerMachine,
  dataRootIsOnLocalDisk: () => boolean,
  platform: NodeJS.Platform = process.platform
): 'local' | 'foreign' | 'unknown' {
  if (holder.machineIdentity && self.machineIdentity) {
    if (holder.machineIdentity !== self.machineIdentity) {
      return 'foreign'
    }
    return openkododPeerIsLiveCloneMachine(holder, self, dataRootIsOnLocalDisk, platform)
      ? 'unknown'
      : 'local'
  }
  if (holder.bootId && holder.bootId === self.bootId) {
    return 'local'
  }
  return dataRootIsOnLocalDisk() ? 'local' : 'unknown'
}

export type OpenkododPeerMachine = {
  machineIdentity?: string
  bootId?: string
  /** Latest of the record's own timestamp and its heartbeat mtime. */
  writtenAtMs?: number
  bootStartedAtMs?: number
  nowMs?: number
}

export function currentOpenkododPeerMachine(): OpenkododPeerMachine {
  const machineIdentity = profileStateAccessMachineIdentity()
  const bootId = readOpenkododProcessIncarnation(process.pid)?.bootId
  return { ...(machineIdentity ? { machineIdentity } : {}), ...(bootId ? { bootId } : {}) }
}

/** PIDs require a provable machine and boot match; unknown peers are never assumed exited. */
export function openkododPeerPidIsJudgeableHere(
  peer: OpenkododPeerMachine,
  self: OpenkododPeerMachine,
  dataRootIsOnLocalDisk: () => boolean
): boolean {
  if (peer.bootId && self.bootId && peer.bootId !== self.bootId) {
    return false
  }
  return openkododLockHolderLocality(peer, self, dataRootIsOnLocalDisk) === 'local'
}

export function openkododLockHolderUnverifiableError(lock: {
  holder: string
  foreign: boolean
  /** The holder runs on another machine that reports this machine-id. */
  cloneMachine?: { role: 'openkodod' | 'desktop' }
  dataRoot: string
  lockPath: string
  /** Managed hosts may lack launchers on PATH, so name this runtime/entry in reclaim hints. */
  hintRuntime: OpenkododReclaimHintRuntime | null
}): OpenkododInstanceLockError {
  const command = openkododStaleLockReclaimCommand(lock.dataRoot, lock.hintRuntime)
  const reclaim =
    process.platform === 'linux'
      ? `run \`${command}\` on the machine it ran on to check and clear it, or `
      : ''
  const cloneHint = lock.cloneMachine ? ` ${openkododCloneMachineHint(lock.cloneMachine.role)}` : ''
  return new OpenkododInstanceLockError(
    'openkodod_instance_lock_holder_unverifiable',
    `${lock.holder} holds the data root ${lock.dataRoot}${lock.foreign || lock.cloneMachine ? ' from another machine' : ''}. ` +
      'OpenKodo cannot check from here whether it is still running, because this data root may be ' +
      `shared with other machines. Stop it there. If it is not running anywhere, ${reclaim}` +
      `delete ${lock.lockPath} once you are sure.${cloneHint}`
  )
}
