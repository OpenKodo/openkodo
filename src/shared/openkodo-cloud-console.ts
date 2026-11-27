// The OpenKodo web console, where team and admin settings are managed. The desktop only links to it;
// main opens the page in the system browser through a single-use ticket URL from auth.
import type { OpenKodoProfileAuthStatus } from './openkodo-profiles/openkodo-profiles'

/** The capability auth sets for accounts that can use the web console. */
export const OPENKODO_CLOUD_CONSOLE_CAPABILITY = 'billing'

const OPENKODO_CLOUD_CONSOLE_SECTIONS = ['home'] as const
export type OpenKodoCloudConsoleSection = (typeof OPENKODO_CLOUD_CONSOLE_SECTIONS)[number]

export type OpenKodoCloudConsoleOpenArgs = { section: OpenKodoCloudConsoleSection }

export type OpenKodoCloudConsoleOpenResult =
  /** `ticketError`: a signed-in desktop's ticket failed or pointed off the allowed origins. */
  | { status: 'opened'; signedIn: boolean; ticketError?: 'failed' | 'rejected' }
  | { status: 'unconfigured' }
  | { status: 'failed'; error: string }

export function isOpenKodoCloudConsoleSection(
  value: unknown
): value is OpenKodoCloudConsoleSection {
  return OPENKODO_CLOUD_CONSOLE_SECTIONS.some((section) => section === value)
}

/** UI only: the console re-checks access server side. */
export function isOpenKodoCloudConsoleAvailable(auth: OpenKodoProfileAuthStatus | null): boolean {
  return (
    auth?.state === 'connected' &&
    auth.capabilities?.flags[OPENKODO_CLOUD_CONSOLE_CAPABILITY] === true
  )
}
