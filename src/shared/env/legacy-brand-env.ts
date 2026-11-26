/**
 * Environment variables used to carry the old product name. OpenKodo reads
 * OPENKODO_*; anything that still exports ORCA_* (a hook installed by an
 * earlier build, a CI job, a wrapper script) is copied across at process start
 * so one release can move the namespace without breaking those callers.
 */
export const LEGACY_BRAND_ENV_PREFIX = 'ORCA_'
export const BRAND_ENV_PREFIX = 'OPENKODO_'

export function aliasLegacyBrandEnv(env: NodeJS.ProcessEnv = process.env): void {
  for (const key of Object.keys(env)) {
    if (!key.startsWith(LEGACY_BRAND_ENV_PREFIX)) {
      continue
    }
    const next = BRAND_ENV_PREFIX + key.slice(LEGACY_BRAND_ENV_PREFIX.length)
    if (env[next] === undefined) {
      env[next] = env[key]
    }
  }
}
