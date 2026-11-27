// Whether a bot's cloud service features wait on this window's OpenKodo sign-in.
import { useAppStore } from '@/store'
import { useBotHostConnectorStatus } from '@/lib/bot-catalog'
import { openkodoCloudNeedsSignIn } from '../../../../shared/bots/host-openkodo-sign-in'
import type { OpenKodoProfileAuthStatus } from '../../../../shared/openkodo-profiles/openkodo-profiles'
import {
  LOCAL_EXECUTION_HOST_ID,
  type ExecutionHostId
} from '../../../../shared/execution-host/execution-host'

function signedOut(status: OpenKodoProfileAuthStatus | null): boolean {
  return status?.state === 'local' || status?.state === 'reconnect-required'
}

/** `useOpenKodoCloudSignedOut` for code outside React. */
export function readOpenKodoCloudSignedOut(
  hostId: ExecutionHostId = LOCAL_EXECUTION_HOST_ID
): boolean {
  return (
    hostId === LOCAL_EXECUTION_HOST_ID &&
    signedOut(useAppStore.getState().openkodoProfileAuthStatus)
  )
}

/**
 * Whether OpenKodo Cloud features of `hostId`'s bots wait on this window's sign-in. Only this computer's:
 * Sign in here signs in this desktop, never a paired server.
 */
export function useOpenKodoCloudSignedOut(
  hostId: ExecutionHostId = LOCAL_EXECUTION_HOST_ID
): boolean {
  return useAppStore(
    (state) => hostId === LOCAL_EXECUTION_HOST_ID && signedOut(state.openkodoProfileAuthStatus)
  )
}

/**
 * Whether this computer's bots wait on its OpenKodo sign-in: signed out, or signed in with a sign-in OpenKodo
 * Cloud refuses (its bots.list connector status), which only signing in again fixes.
 */
export function useOpenKodoCloudNeedsSignIn(): boolean {
  const signedOut = useOpenKodoCloudSignedOut(LOCAL_EXECUTION_HOST_ID)
  const connector = useBotHostConnectorStatus(LOCAL_EXECUTION_HOST_ID)
  return signedOut || openkodoCloudNeedsSignIn(connector)
}
