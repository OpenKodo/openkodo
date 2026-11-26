import { redactKagiSessionToken } from './navigation/browser-url'
import { OPENKODO_BROWSER_BLANK_URL } from './browser-blank-page'

export function getBrowserDisplayTitle(title: string | null | undefined, url: string): string {
  if (
    url === 'about:blank' ||
    url === OPENKODO_BROWSER_BLANK_URL ||
    title === 'about:blank' ||
    title === OPENKODO_BROWSER_BLANK_URL
  ) {
    return 'New Tab'
  }
  return title || redactKagiSessionToken(url) || 'New Tab'
}
