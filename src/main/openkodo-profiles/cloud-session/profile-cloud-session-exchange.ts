import type {
  OpenKodoCloudCapabilities,
  OpenKodoCloudOrgSummary,
  OpenKodoProfileCloudSummary
} from '../../../shared/openkodo-profiles/openkodo-profiles'

export type OpenKodoCloudSessionExchangeResponse = {
  accessToken: string
  refreshToken: string
  expiresAt: number
  cloud: OpenKodoProfileCloudSummary
  organizations?: OpenKodoCloudOrgSummary[]
  capabilities: OpenKodoCloudCapabilities
}
