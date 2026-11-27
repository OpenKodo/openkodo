import { chmodSync, statSync } from 'node:fs'
import process from 'node:process'
import { restrictWindowsPathSync } from '../../../shared/secure-storage/secure-path-windows-acl'

type OpenkododInstanceLockCode =
  | 'openkodod_data_root_unusable'
  | 'openkodod_data_root_wrong_owner'
  | 'openkodod_data_root_shared'
  | 'openkodod_instance_lock_held'
  /** Shared-home/foreign-machine owners may still run and cannot be judged here. */
  | 'openkodod_instance_lock_holder_unverifiable'
  | 'openkodod_instance_lock_foreign_identity'
  | 'openkodod_instance_lock_unreadable'

export class OpenkododInstanceLockError extends Error {
  constructor(
    readonly code: OpenkododInstanceLockCode,
    message: string
  ) {
    super(message)
    this.name = 'OpenkododInstanceLockError'
  }
}

export type OpenkododDataRootPrivacyHooks = {
  platform?: NodeJS.Platform
  restrictWindowsDataRoot?: (dataRoot: string) => boolean
}

/** Repair owned directory permissions before refusing: roots contain credentials and session state. */
export function assertOpenkododDataRootIsPrivate(
  dataRoot: string,
  hooks: OpenkododDataRootPrivacyHooks
): void {
  // Windows synthesizes POSIX mode bits; restrict and verify real ACLs instead.
  if ((hooks.platform ?? process.platform) === 'win32') {
    const restrict =
      hooks.restrictWindowsDataRoot ?? ((path: string) => restrictWindowsPathSync(path, true))
    if (!restrict(dataRoot)) {
      throw new OpenkododInstanceLockError(
        'openkodod_data_root_shared',
        `Could not restrict the openkodod data root ${dataRoot} to this user. openkodod keeps ` +
          'private session and credential state there, so it refuses to start. Point OPENKODO_USER_DATA at a ' +
          'directory this account owns.'
      )
    }
    return
  }
  let stats
  try {
    stats = statSync(dataRoot)
  } catch (error) {
    throw new OpenkododInstanceLockError(
      'openkodod_data_root_unusable',
      `Cannot stat the openkodod data root ${dataRoot}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  const uid = process.getuid?.()
  if (uid !== undefined && stats.uid !== uid) {
    throw new OpenkododInstanceLockError(
      'openkodod_data_root_wrong_owner',
      `The openkodod data root ${dataRoot} is owned by uid ${stats.uid}, not by uid ${uid} running ` +
        'this process. Give openkodod its own data root (OPENKODO_USER_DATA) or chown this one.'
    )
  }
  if ((stats.mode & 0o077) === 0) {
    return
  }
  try {
    chmodSync(dataRoot, 0o700)
  } catch {
    // Re-stat to produce the actionable permission error.
  }
  let mode: number
  try {
    mode = statSync(dataRoot).mode
  } catch (error) {
    throw new OpenkododInstanceLockError(
      'openkodod_data_root_unusable',
      `Cannot stat the openkodod data root ${dataRoot}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  if ((mode & 0o077) !== 0) {
    throw new OpenkododInstanceLockError(
      'openkodod_data_root_shared',
      `The openkodod data root ${dataRoot} is accessible to other users (mode ` +
        `${(mode & 0o777).toString(8)}) and could not be tightened. openkodod keeps ` +
        'private session and credential state there, so it refuses to start. Run `chmod 700` on it, or point OPENKODO_USER_DATA ' +
        'at a private directory.'
    )
  }
}
