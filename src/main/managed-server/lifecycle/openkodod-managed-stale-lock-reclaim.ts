// Let the active slot gather lock evidence and apply nonce-pinned confirmation; clients only relay it.
import { z } from 'zod'
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import {
  OPENKODOD_RECLAIM_STALE_LOCK_FLAG,
  OPENKODOD_STALE_LOCK_DATA_ROOT_FLAG,
  OPENKODOD_STALE_LOCK_EXPECT_NONCE_FLAG
} from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-stale-lock-reclaim'
import type {
  OpenkododManagedStaleLockReclaimRequest,
  OpenkododManagedStaleLockReclaimResult
} from '../../../shared/remote-runtime/openkodod-lifecycle/openkodod-managed-runtime'
import {
  OPENKODOD_LAUNCHER_FILENAME,
  OPENKODOD_SERVER_ENTRY_FILENAME
} from '../../../shared/remote-runtime/openkodod-distribution/openkodod-artifacts'
import { withOpenkododActivationLock } from '../activation/openkodod-activation-lock'
import { readOpenkododActivationRecord } from '../activation/openkodod-activation-record-store'
import {
  followLaunchedServerPort,
  withManagedOpenkododLifecycle
} from './openkodod-managed-lifecycle'
import {
  managedOpenkododSlot,
  resolveLinkedOpenkododContext
} from './openkodod-managed-runtime-context'
import { selectOpenkododSlotRuntimeCommand } from '../install/openkodod-remote-runtime'
import { execOpenkododRemote } from '../install/openkodod-remote-runtime-control'
import { openkododSlotDir, type OpenkododSlotOptions } from '../activation/openkodod-recovery-slot'
import { joinRemotePath } from '../../ssh/remote-host/ssh-remote-platform'
import { isSshCommandExitError } from '../../ssh/remote-exec/remote-exec-command'
import { wakeStoppedManagedOpenkodod } from './openkodod-managed-wake'
import { OPENKODOD_LOCK_FILE_NAME } from '../../openkodod/instance-lock/openkodod-instance-lock'
import { errorMessage } from '../../../shared/errors/error-message'

const ReclaimStatusSchema = z.enum(['none', 'eligible', 'refused', 'reclaimed'])

// Unknown newer statuses map to no-answer rather than failing reply parsing.
const ReclaimAnswerSchema = z.object({
  status: z.string(),
  lockPath: z.string(),
  message: z.string(),
  evidence: z
    .object({
      pid: z.number(),
      host: z.string(),
      bootId: z.string(),
      currentBootId: z.string(),
      ageMinutes: z.number(),
      nonce: z.string().optional()
    })
    .optional()
})

const RECLAIM_UNSUPPORTED_SENTINEL = 'OPENKODO_STALE_LOCK_RECLAIM_UNSUPPORTED'
const RECLAIM_UNPINNED_SENTINEL = 'OPENKODO_STALE_LOCK_RECLAIM_UNPINNED'

type ReclaimAnswer = Omit<z.infer<typeof ReclaimAnswerSchema>, 'status'> & {
  status: z.infer<typeof ReclaimStatusSchema>
}

type SlotReclaim =
  | { status: 'answered'; answer: ReclaimAnswer }
  /** Slots without nonce pinning require manual reclamation. */
  | { status: 'unsupported' | 'unpinned' | 'no-answer' | 'busy'; message: string }

export async function runManagedOpenkododStaleLockReclaim(
  userDataPath: string,
  selector: string,
  request: OpenkododManagedStaleLockReclaimRequest
): Promise<OpenkododManagedStaleLockReclaimResult> {
  return await withManagedOpenkododLifecycle(
    userDataPath,
    selector,
    async ({ environment, deployment }) => {
      const context = await resolveLinkedOpenkododContext(environment, deployment)
      if (context.host.os !== 'linux') {
        return unsupported('This host’s OpenKodo server has no stale-lock recovery.')
      }
      const slot = managedOpenkododSlot(context, deployment.remotePort)
      // Serialize reclamation with launch so wake cannot race lock removal.
      const ran = await withOpenkododActivationLock(
        slot,
        () => runOnActiveSlot(slot, request),
        (): SlotReclaim => ({
          status: 'busy',
          message: 'An update, rollback or recovery holds this host; try again when it finishes.'
        })
      )
      if (ran.status === 'unsupported') {
        const lockPath = joinRemotePath(slot.host, slot.userDataDir, OPENKODOD_LOCK_FILE_NAME)
        return { status: 'unsupported', message: ran.message, lockPath }
      }
      if (ran.status === 'unpinned') {
        return { status: 'unsupported', message: ran.message, reclaimWithoutPin: true }
      }
      if (ran.status !== 'answered') {
        return { status: ran.status, message: ran.message }
      }
      const { answer } = ran
      if (answer.status !== 'reclaimed') {
        return { ...answer, status: answer.status }
      }
      const reclaimed = {
        status: 'reclaimed',
        environmentId: environment.id,
        message: answer.message,
        lockPath: answer.lockPath,
        ...(answer.evidence ? { evidence: answer.evidence } : {})
      } as const
      const notRestarted = await restartAfterReclaim(userDataPath, environment.id, slot)
      return notRestarted ? { ...reclaimed, notRestarted } : reclaimed
    }
  )
}

/** Preserve successful reclamation even if restart fails; return the restart warning. */
async function restartAfterReclaim(
  userDataPath: string,
  environmentId: string,
  slot: OpenkododSlotOptions
): Promise<string | null> {
  try {
    const wake = await wakeStoppedManagedOpenkodod(slot)
    if (wake.outcome !== 'started' && wake.outcome !== 'serving') {
      return wake.outcome === 'recovery-refused'
        ? wake.reason
        : `The lock was cleared, but this host’s OpenKodo server did not start (${wake.outcome}); reconnect to start it.`
    }
    await followLaunchedServerPort(userDataPath, environmentId)
    return null
  } catch (error) {
    // Still return a result so callers can reconnect and clear stale notes.
    return `The lock was cleared, but this host’s OpenKodo server did not start: ${errorMessage(error)}`
  }
}

async function runOnActiveSlot(
  slot: OpenkododSlotOptions,
  request: OpenkododManagedStaleLockReclaimRequest
): Promise<SlotReclaim> {
  // Another client may change the active slot while this one waits for the lock.
  const active = (await readOpenkododActivationRecord(slot)).active
  if (!active) {
    return { status: 'unsupported', message: 'This host has no activated OpenKodo server.' }
  }
  const slotDir = openkododSlotDir(slot, active)
  const entry = joinRemotePath(slot.host, slotDir, OPENKODOD_LAUNCHER_FILENAME)
  const bundle = joinRemotePath(slot.host, slotDir, OPENKODOD_SERVER_ENTRY_FILENAME)
  const confirm = request.yes
    ? ` ${OPENKODOD_STALE_LOCK_EXPECT_NONCE_FLAG} ${quotePosixShell(request.expectNonce)} --yes`
    : ''
  // Check support first: old slots might start serving or reclaim an unapproved replacement lock.
  const command =
    `if grep -qF -- ${quotePosixShell(OPENKODOD_STALE_LOCK_EXPECT_NONCE_FLAG)} ${quotePosixShell(bundle)} 2>/dev/null; then ` +
    `${selectOpenkododSlotRuntimeCommand(slot.host, slotDir, '')} && ` +
    `"$openkodod_runtime" ${quotePosixShell(entry)} ${OPENKODOD_RECLAIM_STALE_LOCK_FLAG} ` +
    `${OPENKODOD_STALE_LOCK_DATA_ROOT_FLAG} ${quotePosixShell(slot.userDataDir)} --json${confirm}; ` +
    `elif grep -qF -- ${quotePosixShell(OPENKODOD_RECLAIM_STALE_LOCK_FLAG)} ${quotePosixShell(bundle)} 2>/dev/null; then ` +
    `echo ${RECLAIM_UNPINNED_SENTINEL}; else echo ${RECLAIM_UNSUPPORTED_SENTINEL}; fi`
  let output: string
  try {
    output = await execOpenkododRemote(slot, command)
  } catch (error) {
    // Non-reclaimed outcomes exit nonzero but still print structured replies.
    if (!isSshCommandExitError(error)) {
      throw error
    }
    output = error.stdout
  }
  const lines = output.split('\n').map((line) => line.trim())
  if (lines.includes(RECLAIM_UNSUPPORTED_SENTINEL)) {
    return unsupported('This host’s OpenKodo server predates the stale-lock recovery.')
  }
  if (lines.includes(RECLAIM_UNPINNED_SENTINEL)) {
    return {
      status: 'unpinned',
      message: 'This host’s OpenKodo server is too old for OpenKodo to clear the lock from here.'
    }
  }
  const answer = parseReclaimAnswer(output)
  return answer
    ? { status: 'answered', answer }
    : {
        status: 'no-answer',
        message:
          'This host’s OpenKodo server gave no answer OpenKodo understands to the stale-lock check.'
      }
}

function parseReclaimAnswer(output: string): ReclaimAnswer | null {
  const line = output
    .trim()
    .split('\n')
    .findLast((candidate) => candidate.trim().startsWith('{'))
  if (!line) {
    return null
  }
  try {
    const parsed = ReclaimAnswerSchema.safeParse(JSON.parse(line))
    const status = ReclaimStatusSchema.safeParse(parsed.data?.status)
    return parsed.success && status.success ? { ...parsed.data, status: status.data } : null
  } catch {
    return null
  }
}

function unsupported(message: string): { status: 'unsupported'; message: string } {
  return { status: 'unsupported', message }
}
