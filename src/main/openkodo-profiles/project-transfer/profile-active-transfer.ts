import type {
  TransferOpenKodoProfileProjectArgs,
  TransferOpenKodoProfileProjectResult
} from '../../../shared/openkodo-profiles/openkodo-profiles'
import type { Store } from '../../persistence/loading-store/store'
import { transferOpenKodoProfileProject } from './profile-project-transfer'
import { hasOpenKodoProfileStateDatabase } from '../profile-storage-paths'
import './profile-project-move-intent'
import { profileHasPendingProjectMove } from './profile-project-move-record'
import { flushActiveProfileBeforeFileMutation } from '../storage/profile-persistence-deadline'

/** Keep the active Store stopped until file mutation either succeeds or proves unchanged. */
export async function transferActiveProfileProject(
  args: TransferOpenKodoProfileProjectArgs,
  userDataPath: string,
  store: Pick<Store, 'beginProfileMaintenance'>,
  reopenSource: () => Promise<void>
): Promise<TransferOpenKodoProfileProjectResult> {
  const hadDatabase = hasOpenKodoProfileStateDatabase(args.sourceProfileId, userDataPath)
  const pendingMove = profileHasPendingProjectMove(args.sourceProfileId, userDataPath)
  const maintenance = await flushActiveProfileBeforeFileMutation(store, { flush: !pendingMove })
  let result: TransferOpenKodoProfileProjectResult
  try {
    if (profileHasPendingProjectMove(args.sourceProfileId, userDataPath)) {
      throw new Error('active_source_openkodo_profile_move_requires_recovery')
    }
    result = transferOpenKodoProfileProject(args, userDataPath)
  } catch (error) {
    const needsRecovery =
      (!hadDatabase && hasOpenKodoProfileStateDatabase(args.sourceProfileId, userDataPath)) ||
      profileHasPendingProjectMove(args.sourceProfileId, userDataPath)
    // Further writes would invalidate a retained move's recovery revision.
    await (needsRecovery ? reopenSource() : maintenance.resume())
    throw error
  }
  if (result.status !== 'transferred' || args.mode !== 'move') {
    await maintenance.resume()
  }
  return result
}
