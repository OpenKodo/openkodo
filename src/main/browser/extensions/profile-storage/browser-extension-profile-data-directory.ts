import { app } from 'electron'
import { join } from 'node:path'

let openkodoProfileDirectory: string | null = null

/** Browser profile ids repeat across OpenKodo profiles ("default"), so their extension data lives per OpenKodo profile. */
export function configureBrowserExtensionProfileDataDirectory(profileDirectory: string): void {
  openkodoProfileDirectory = profileDirectory
}

/** Root of the per-browser-profile extension stores (sync storage, grants and state, DNR). */
export function getBrowserExtensionProfileDataDirectory(): string {
  return join(openkodoProfileDirectory ?? app.getPath('userData'), 'browser-extensions')
}
