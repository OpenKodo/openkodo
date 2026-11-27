import type { OpenKodoVmRecipe } from '../../../shared/workspace-setup/openkodo-yaml-hook-types'
import type { PluginService } from '../plugin-service'

export async function getApprovedPluginVmRecipes(
  pluginService?: PluginService
): Promise<OpenKodoVmRecipe[]> {
  if (!pluginService) {
    return []
  }
  await pluginService.whenReady()
  return pluginService.contentPacks.vmRecipes.list().map(({ recipe }) => recipe)
}
