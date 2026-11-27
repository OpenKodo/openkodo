import { z } from 'zod'
import { validRange } from 'semver'
import { pluginMarketplaceGitSourceSchema } from '../plugins/catalog/plugin-marketplace'
import { isQualifiedPluginKey } from '../plugins/manifest/plugin-manifest'
import { isValidAppVersion } from '../app-lifecycle/identity/app-version'
import type { OpenKodoCloudCapabilities } from './openkodo-cloud-capabilities'
import type { OpenKodoProfileAuthStatus } from './openkodo-profiles'

export const OPENKODO_CLOUD_TEAM_SETTINGS = 'team_settings'
export const OPENKODO_CLOUD_DESKTOP_REPORTING = 'desktop.deviceReporting'

export const OPENKODO_CLOUD_TEAM_POLICY_FLAGS = {
  mobileRelay: 'relay.use',
  bots: 'desktop.bots',
  computerUse: 'desktop.computerUse',
  artifactSharing: 'artifacts.share',
  plugins: 'desktop.plugins',
  officialPlugins: 'plugins.official',
  communityPlugins: 'plugins.community',
  allowMemberSources: 'plugins.memberSources'
} as const

export type OpenKodoCloudTeamFeatureFlag =
  (typeof OPENKODO_CLOUD_TEAM_POLICY_FLAGS)[keyof typeof OPENKODO_CLOUD_TEAM_POLICY_FLAGS]

export function getGoverningTeamCapabilities(
  capabilities: OpenKodoCloudCapabilities | undefined
): OpenKodoCloudCapabilities | undefined {
  return capabilities?.flags[OPENKODO_CLOUD_TEAM_SETTINGS] === true &&
    capabilities.teamPolicy?.orgIds?.length
    ? capabilities
    : undefined
}

export function getDesktopReportingOrgIds(
  capabilities: OpenKodoCloudCapabilities | undefined
): string[] {
  if (capabilities?.flags[OPENKODO_CLOUD_DESKTOP_REPORTING] !== true) {
    return []
  }
  const policy = getGoverningTeamCapabilities(capabilities)?.teamPolicy
  return policy?.reportingOrgIds?.filter((id) => policy.orgIds.includes(id)) ?? []
}

export function isOpenKodoCloudTeamFeatureBlocked(
  auth: OpenKodoProfileAuthStatus | null,
  flag: OpenKodoCloudTeamFeatureFlag
): boolean {
  return getOpenKodoCloudTeamCapabilities(auth)?.flags[flag] === false
}

export function getOpenKodoCloudTeamCapabilities(
  auth: OpenKodoProfileAuthStatus | null
): OpenKodoCloudCapabilities | undefined {
  return auth?.state === 'connected' && auth.cloud
    ? getGoverningTeamCapabilities(auth.capabilities)
    : undefined
}

const requiredPluginRuleSchema = z.object({
  pluginKey: z.string().refine(isQualifiedPluginKey),
  catalog: z.union([z.enum(['official', 'community']), pluginMarketplaceGitSourceSchema]),
  version: z
    .string()
    .max(128)
    .refine((range) => range.trim().length > 0 && validRange(range) !== null)
})
export type RequiredPluginRule = z.infer<typeof requiredPluginRuleSchema>

export const openkodoCloudTeamPolicySchema = z.object({
  orgIds: z.array(z.string().min(1)).min(1),
  reportingOrgIds: z.array(z.string().min(1)).optional(),
  internalCatalogs: z.array(pluginMarketplaceGitSourceSchema).optional(),
  internalCatalogAttribution: z
    .array(z.object({ catalog: pluginMarketplaceGitSourceSchema, teamNames: z.array(z.string()) }))
    .optional(),
  requiredPlugins: z.array(z.string().refine(isQualifiedPluginKey)).optional(),
  requiredPluginRules: z.array(requiredPluginRuleSchema).optional(),
  blockedPlugins: z.array(z.string().refine(isQualifiedPluginKey)).optional(),
  updateChannel: z.enum(['stable', 'rc']).optional(),
  updateDelayDays: z.number().int().min(0).max(90).optional(),
  minimumVersion: z.string().max(64).refine(isValidAppVersion).optional(),
  forceUpdates: z.boolean().optional(),
  forceUpdateDelayDays: z.number().int().min(0).max(30).optional(),
  forceUsesMemberDelay: z.boolean().optional(),
  restartDeadlineHours: z.number().int().min(1).max(168).optional()
})

export type OpenKodoCloudTeamPolicy = z.infer<typeof openkodoCloudTeamPolicySchema>
