// COMPAT(wsl-bridge): removed when WSL runs as an openkodod host.
import { buildAgentFeatureSkillInstallCommand as buildPinnedSkillInstallCommand } from '../../../../../shared/skills/installation/agent-feature-install-commands'
import {
  OPENKODO_CLI_SKILL_NAME,
  OPENKODO_LINEAR_SKILL_NAME,
  ORCHESTRATION_SKILL_NAME
} from './agent-feature-skill-names'

/** The interactive install, pinned to this build; also the update, since `add` re-copies. */
export function buildAgentFeatureSkillInstallCommand(skillNames: readonly string[]): string {
  return buildPinnedSkillInstallCommand(skillNames, { sourceCommit: OPENKODO_BUILD_COMMIT })
}

export const ORCHESTRATION_SKILL_INSTALL_COMMAND = buildAgentFeatureSkillInstallCommand([
  ORCHESTRATION_SKILL_NAME
])

export const OPENKODO_CLI_ORCHESTRATION_SKILL_INSTALL_COMMAND =
  buildAgentFeatureSkillInstallCommand([OPENKODO_CLI_SKILL_NAME, ORCHESTRATION_SKILL_NAME])

export const OPENKODO_LINEAR_SKILL_INSTALL_COMMAND = buildAgentFeatureSkillInstallCommand([
  OPENKODO_LINEAR_SKILL_NAME
])
