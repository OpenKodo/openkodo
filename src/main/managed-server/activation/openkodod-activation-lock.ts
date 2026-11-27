// Retain journal and fence until one serving slot is proven; release removes both, while only recovery may take retained state over.
import { randomUUID } from 'node:crypto'
import {
  execOpenkododRemote,
  withoutAbortSignal,
  type OpenkododRemoteExecTarget
} from '../install/openkodod-remote-runtime-control'
import { isUnconfirmedSshCommandTermination } from '../../ssh/remote-exec/remote-exec-command'
import { acquireInstallLock, RemoteInstallLockBusyError } from '../install/remote-install-lock'
import {
  orphanInstallLockCommand,
  probeInstallLockExistsCommand
} from '../install/remote-install-lock-commands'
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import {
  OPENKODOD_FENCE_OWNER_FILENAME,
  posixOpenkododFenceOwnedTest,
  runWithOpenkododFence,
  type OpenkododFence
} from './openkodod-activation-fence-scope'
import {
  openkododRemoteBaseDir,
  openkododWindowsHomeOpCommand
} from '../install/openkodod-remote-windows-node'
import { forgetHeldOpenkododFence, rememberHeldOpenkododFence } from './openkodod-held-fence-tokens'
import { exitedOwnLockProof } from './openkodod-exited-own-lock'
import { isWindowsRemoteHost } from '../../ssh/remote-host/ssh-remote-platform'
import {
  openkododActivationFenceLockDir,
  openkododActivationTransactionPath,
  openkododActivationTransactionRoot
} from './openkodod-activation-transaction'
import {
  readOpenkododActivationTransaction,
  writeOpenkododActivationTransaction
} from './openkodod-activation-transaction-store'

const OPENKODOD_ACTIVATION_MAX_READINESS_TIMEOUT_MS = 5 * 60_000

export type OpenkododActivationLockOptions = OpenkododRemoteExecTarget & { remoteHome: string }

export type OpenkododActivationLockControl = {
  /** Retain on throw once a journal describes possibly changed host state. */
  retainOnError(): void
  /** Retain on success too when serving-slot ownership remains unproven. */
  retain(): void
  /** Release even on later throw once the recorded slot is proven restored. */
  recovered(): void
}

/** Bound readiness below the stale-lock window so live waiters do not look abandoned. */
export function resolveOpenkododActivationReadinessTimeout(
  configured: number | undefined,
  fallback: number
): number {
  const timeout = configured ?? fallback
  if (
    !Number.isSafeInteger(timeout) ||
    timeout <= 0 ||
    timeout > OPENKODOD_ACTIVATION_MAX_READINESS_TIMEOUT_MS
  ) {
    throw new Error(
      `openkodod readiness timeout must be an integer from 1 to ${OPENKODOD_ACTIVATION_MAX_READINESS_TIMEOUT_MS}ms`
    )
  }
  return timeout
}

// Tolerate brief concurrent work without stalling the lifecycle queue for a full stale window.
const OPENKODOD_ACTIVATION_FENCE_WAIT_MS = 5_000

/** Report held after a brief wait; token identifies this generation for subsequent recovery proof. */
export async function withOpenkododActivationLock<T>(
  options: OpenkododActivationLockOptions,
  run: (control: OpenkododActivationLockControl) => Promise<T>,
  held: () => T | Promise<T>,
  token: string = randomUUID()
): Promise<T> {
  const lockRoot = openkododActivationTransactionRoot(options.host, options.remoteHome)
  rememberHeldOpenkododFence(token)
  try {
    await acquireInstallLock(options.conn, lockRoot, options.host, {
      signal: options.signal,
      relayGcClaim: false,
      // Unresolved state ownership cannot become safe through age alone.
      allowStaleTakeover: false,
      waitTimeoutMs: OPENKODOD_ACTIVATION_FENCE_WAIT_MS,
      owner: { fileName: OPENKODOD_FENCE_OWNER_FILENAME, token }
    })
  } catch (error) {
    if (error instanceof RemoteInstallLockBusyError) {
      forgetHeldOpenkododFence(token)
      return await held()
    }
    throw error
  }
  const fence = activationFence(options, token)
  let retainOnError = false
  let retain = false
  try {
    const result = await runWithOpenkododFence(fence, () =>
      run({
        retainOnError: () => {
          retainOnError = true
        },
        retain: () => {
          retain = true
        },
        recovered: () => {
          retainOnError = false
        }
      })
    )
    await (retain ? orphanRetainedFence(options, fence) : releaseActivationFence(options, fence))
    return result
  } catch (error) {
    // Unconfirmed host work may still mutate state, so do not age its fence.
    if (!isUnconfirmedSshCommandTermination(error)) {
      await (
        retainOnError ? orphanRetainedFence(options, fence) : releaseActivationFence(options, fence)
      ).catch((releaseError: unknown) => {
        console.warn(
          `[openkodod] Failed to release activation lock after an error: ${releaseError instanceof Error ? releaseError.message : String(releaseError)}`
        )
      })
    }
    throw error
  }
}

/** Recover stale, previous-boot or proven exited-own fences; a fresh live owner remains busy. */
export async function withStaleOpenkododActivationRecoveryLock<T>(
  options: OpenkododActivationLockOptions,
  run: (control: Pick<OpenkododActivationLockControl, 'retain'>) => Promise<T>
): Promise<T> {
  const lockRoot = openkododActivationTransactionRoot(options.host, options.remoteHome)
  const token = randomUUID()
  rememberHeldOpenkododFence(token)
  // Takeover replaces the token so the predecessor can neither act nor release.
  await acquireInstallLock(options.conn, lockRoot, options.host, {
    signal: options.signal,
    relayGcClaim: false,
    allowStaleTakeover: true,
    waitTimeoutMs: 0,
    owner: { fileName: OPENKODOD_FENCE_OWNER_FILENAME, token },
    exitedOwner: exitedOwnLockProof(options, {
      baseDir: openkododRemoteBaseDir(options.host, options.remoteHome),
      guardsStateMutation: true
    })
  }).catch((error: unknown) => {
    if (error instanceof RemoteInstallLockBusyError) {
      forgetHeldOpenkododFence(token)
    }
    throw error
  })
  const fence = activationFence(options, token)
  let retain = false
  let result: T
  try {
    result = await runWithOpenkododFence(fence, async () => {
      await adoptInterruptedJournal(options)
      return run({ retain: () => (retain = true) })
    })
  } catch (error) {
    // Failed recovery retains ownership fencing until one serving slot is proven.
    if (!isUnconfirmedSshCommandTermination(error)) {
      await orphanRetainedFence(options, fence).catch(() => undefined)
    }
    throw error
  }
  await (retain ? orphanRetainedFence(options, fence) : releaseActivationFence(options, fence))
  return result
}

/** Adopt the journal into this generation so release recognizes it as owned. */
async function adoptInterruptedJournal(options: OpenkododActivationLockOptions): Promise<void> {
  const journal = await readOpenkododActivationTransaction(options).catch(() => null)
  if (journal) {
    await writeOpenkododActivationTransaction(options, journal)
  }
}

function activationFence(options: OpenkododActivationLockOptions, token: string): OpenkododFence {
  return { lockDir: openkododActivationFenceLockDir(options.host, options.remoteHome), token }
}

/** Age retained, finished work for immediate recovery; token guards prevent aging a successor's fence. */
async function orphanRetainedFence(
  options: OpenkododActivationLockOptions,
  fence: OpenkododFence
): Promise<void> {
  try {
    await runWithOpenkododFence(fence, () =>
      execOpenkododRemote(
        withoutAbortSignal(options),
        orphanInstallLockCommand(options.host, fence.lockDir)
      )
    )
    forgetHeldOpenkododFence(fence.token)
  } catch (error) {
    // Failed orphan marking keeps the fence held until its normal stale window expires.
    console.warn(
      `[openkodod] Could not mark a retained activation fence as ownerless: ${String(error)}`
    )
  }
}

/** Failed probes throw; unreadable must never mean unfenced. */
export async function openkododActivationFenceExists(
  options: OpenkododActivationLockOptions
): Promise<boolean> {
  const lockDir = openkododActivationFenceLockDir(options.host, options.remoteHome)
  const answer = (
    await execOpenkododRemote(options, probeInstallLockExistsCommand(options.host, lockDir))
  ).trim()
  if (answer !== 'LOCKED' && answer !== 'OPEN') {
    throw new Error('The activation fence probe returned no verifiable answer.')
  }
  return answer === 'LOCKED'
}

export function releaseOpenkododActivationFence(
  options: OpenkododActivationLockOptions,
  token: string
): Promise<void> {
  return releaseActivationFence(options, activationFence(options, token))
}

/** Remove only this generation: journal first, then rename the owned lock aside before deletion. */
async function releaseActivationFence(
  options: OpenkododActivationLockOptions,
  fence: OpenkododFence
): Promise<void> {
  const lockRoot = openkododActivationTransactionRoot(options.host, options.remoteHome)
  const journal = openkododActivationTransactionPath(options.host, options.remoteHome)
  // Cancellation must not prevent releasing a fence already proven unnecessary.
  const target = withoutAbortSignal(options)
  const command = isWindowsRemoteHost(options.host)
    ? openkododWindowsHomeOpCommand(options.host, options.remoteHome, 'fence-release', [
        fence.lockDir,
        journal,
        fence.token
      ])
    : posixReleaseFenceCommand(fence, journal, lockRoot)
  const answer = (await execOpenkododRemote(target, command)).trim()
  forgetHeldOpenkododFence(fence.token)
  if (answer.endsWith('SUPERSEDED')) {
    console.warn(
      '[openkodod] A newer run had taken this activation fence over; it was left in place.'
    )
  }
}

/** Rename then check ownership, restoring foreign entries so stalled release cannot delete a successor's state. */
export function posixReleaseFenceCommand(
  fence: OpenkododFence,
  journal: string,
  lockRoot: string
): string {
  const lock = quotePosixShell(fence.lockDir)
  const journalPath = quotePosixShell(journal)
  const stamp = quotePosixShell(journalFenceStamp(fence.token))
  return [
    `${posixOpenkododFenceOwnedTest(fence)} || { echo SUPERSEDED; exit 0; };`,
    `ja=${journalPath}.release.$$;`,
    `if mv ${journalPath} "$ja" 2>/dev/null; then`,
    `grep -qF ${stamp} "$ja" || mv -n "$ja" ${journalPath} 2>/dev/null; rm -f "$ja"; fi;`,
    `la=${lock}.released.$$;`,
    `if mv ${lock} "$la" 2>/dev/null; then`,
    `if [ "$(cat "$la"/${OPENKODOD_FENCE_OWNER_FILENAME} 2>/dev/null)" = ${quotePosixShell(fence.token)} ]; then rm -rf "$la";`,
    `else mv -n "$la" ${lock} 2>/dev/null; fi; fi;`,
    `rmdir ${quotePosixShell(lockRoot)} 2>/dev/null; echo RELEASED`
  ].join(' ')
}

function journalFenceStamp(token: string): string {
  return `"fenceToken": ${JSON.stringify(token)}`
}
