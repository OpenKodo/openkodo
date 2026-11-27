import { useState } from 'react'
import { useAppStore } from '@/store'
import { useOpenKodoTeamFeatureBlocked } from '@/lib/openkodo-team-policy'
import { OPENKODO_CLOUD_TEAM_POLICY_FLAGS } from '../../../../shared/openkodo-profiles/openkodo-cloud-team-policy'
import {
  resolveMobilePairingConnectionMode,
  type MobilePairingConnectionMode
} from '../../../../shared/remote-runtime/pairing/mobile-pairing-connection-mode'

/** Resolve persisted mode and sign-in consistently across MobilePage and MobilePane. */
export function useMobilePairingConnectionMode(): [
  MobilePairingConnectionMode,
  React.Dispatch<React.SetStateAction<MobilePairingConnectionMode>>
] {
  const savedConnectionMode = useAppStore((s) => s.settings?.mobilePairingConnectionMode)
  const signedIn = useAppStore((s) => s.openkodoProfileAuthStatus?.state === 'connected')
  const relayBlocked = useOpenKodoTeamFeatureBlocked(OPENKODO_CLOUD_TEAM_POLICY_FLAGS.mobileRelay)
  const [connectionMode, setConnectionMode] = useState<MobilePairingConnectionMode>(() =>
    resolveMobilePairingConnectionMode(savedConnectionMode, { signedIn })
  )
  const [resolvedFrom, setResolvedFrom] = useState({ savedConnectionMode, signedIn })
  if (
    resolvedFrom.savedConnectionMode !== savedConnectionMode ||
    resolvedFrom.signedIn !== signedIn
  ) {
    setResolvedFrom({ savedConnectionMode, signedIn })
    setConnectionMode(resolveMobilePairingConnectionMode(savedConnectionMode, { signedIn }))
  }
  return [relayBlocked ? 'local-only' : connectionMode, setConnectionMode]
}
