import { collapseHomePath } from '../../shared/skills/bundled/bundled-skill-locations'
import type { OpenKodoUninstallPath } from '../../shared/uninstall/openkodo-uninstall-types'

const CODEX_ACCOUNT_HOME = /^codex-accounts[\\/][^\\/]+[\\/]home[\\/](.+)$/u

/** Paths inside OpenKodo's data folder (a managed Codex account home) read as a label, not a long path. */
export function describeOpenKodoUninstallPath(
  path: string,
  roots: { homeDir: string; userDataPath: string }
): OpenKodoUninstallPath {
  const display = collapseHomePath(path, roots.homeDir)
  // Collapsing against userData instead of home yields `~/<relative>` only for paths inside it.
  const inData = collapseHomePath(path, roots.userDataPath)
  if (inData === path) {
    return { path: display, openkodoData: null }
  }
  const relative = inData.slice(2)
  const codex = CODEX_ACCOUNT_HOME.exec(relative)
  return {
    path: display,
    openkodoData: codex
      ? { kind: 'codex-account', relative: codex[1] }
      : { kind: 'app-data', relative }
  }
}
