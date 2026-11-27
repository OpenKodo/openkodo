import { useEffect } from 'react'
import { useAppStore } from '../../store/index'

/** Refresh cached auth on surface mount so post-launch revocation appears; retain the cached display while fetching. */
export function useOpenKodoProfileAuthStatusRefresh(): void {
  const fetchAuthStatus = useAppStore((state) => state.fetchOpenKodoProfileAuthStatus)
  useEffect(() => {
    void fetchAuthStatus()
  }, [fetchAuthStatus])
}
