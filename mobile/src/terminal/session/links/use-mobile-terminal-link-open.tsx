import { useCallback, useState } from 'react'
import { MobileLinkActionSheet } from '../../../browser/link-open/MobileLinkActionSheet'
import { openMobileWebLink } from '../../../browser/link-open/mobile-web-link-open'
import type { MobileSessionController } from '../../../session/use-mobile-session-controller'

export function useMobileTerminalLinkOpen(
  controller: Pick<
    MobileSessionController,
    'activeHandleRef' | 'linkOpenMode' | 'activeSessionTab'
  >,
  openInOpenKodo: ((url: string) => void) | undefined
) {
  const { activeHandleRef, linkOpenMode } = controller
  const tabId = controller.activeSessionTab?.id
  const [asked, setAsked] = useState<{ url: string; tabId: string | undefined } | null>(null)
  // A sheet asked from one tab must not reappear after the person returns to it.
  if (asked && asked.tabId !== tabId) {
    setAsked(null)
  }
  const handleTerminalOpenUrl = useCallback(
    (handle: string, url: string) => {
      if (handle !== activeHandleRef.current) {
        return
      }
      openMobileWebLink(url, linkOpenMode, openInOpenKodo, (link) => setAsked({ url: link, tabId }))
    },
    [activeHandleRef, linkOpenMode, openInOpenKodo, tabId]
  )
  const terminalLinkSheet =
    asked && asked.tabId === tabId ? (
      <MobileLinkActionSheet
        url={asked.url}
        openInOpenKodo={openInOpenKodo}
        onClose={() => setAsked(null)}
      />
    ) : null
  return { handleTerminalOpenUrl, terminalLinkSheet }
}
