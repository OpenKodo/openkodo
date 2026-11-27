import { createRequire } from 'node:module'
import type * as WindowsNotifications from '@openkodo/windows-notifications'

const requireFromMain = createRequire(__filename)

export function isWindowsFocusAssistActive(): boolean {
  if (process.platform !== 'win32') {
    return false
  }
  try {
    const native: typeof WindowsNotifications = requireFromMain('@openkodo/windows-notifications')
    const profile = native.getFocusAssistState()
    return profile === 1 || profile === 2
  } catch {
    return false
  }
}
