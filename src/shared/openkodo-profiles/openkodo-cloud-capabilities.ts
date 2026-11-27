import type { OpenKodoCloudTeamPolicy } from './openkodo-cloud-team-policy'

export type OpenKodoCloudCapabilityFlags = Record<string, boolean>

export type OpenKodoCloudCapabilities = {
  flags: OpenKodoCloudCapabilityFlags
  refreshedAt: number
  teamPolicy?: OpenKodoCloudTeamPolicy
  /** The web console's https origin, as auth advertises it (its ticket URLs land there). */
  consoleOrigin?: string
}
