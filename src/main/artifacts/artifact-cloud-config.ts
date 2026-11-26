import { app } from 'electron'

const PRODUCTION_ARTIFACTS_API_URL = ''

function isPackaged(): boolean {
  try {
    return app?.isPackaged === true
  } catch {
    return false
  }
}

export function resolveArtifactCloudApiUrl(
  override?: string,
  env: NodeJS.ProcessEnv = process.env,
  packaged = isPackaged()
): string {
  const candidate = override?.trim() || env.OPENKODO_ARTIFACTS_API_URL?.trim()
  if (!candidate && !PRODUCTION_ARTIFACTS_API_URL) {
    throw new Error('Sharing is not available in this build.')
  }
  const url = new URL(candidate || PRODUCTION_ARTIFACTS_API_URL)
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  const firstParty = ['openkodo.dev'].some(
    (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`)
  )
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback && !packaged)) {
    throw new Error('Artifact API URLs must use HTTPS; local development may use loopback HTTP.')
  }
  if (!firstParty && !loopback) {
    throw new Error('Artifact API URLs must use an openkodo.dev or loopback host.')
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Artifact API URL must be an origin without credentials, paths, or parameters.')
  }
  return url.origin
}

export function allowsArtifactCloudAuthOverride(
  env: NodeJS.ProcessEnv = process.env,
  packaged = isPackaged()
): boolean {
  return env.NODE_ENV !== 'production' && !packaged
}
