import type { SkillInstallDestination } from '../../../shared/skills/installation/skill-install-contract'
import type { OpenKodoRuntimeService } from '../../runtime/openkodo-runtime'

export async function classifySkillCloudInstallTarget(
  runtime: OpenKodoRuntimeService,
  input: { environmentId?: string; destination: SkillInstallDestination }
): Promise<'local' | 'remote'> {
  return input.environmentId || (await runtime.skillInstallDestinationUsesSsh(input.destination))
    ? 'remote'
    : 'local'
}
