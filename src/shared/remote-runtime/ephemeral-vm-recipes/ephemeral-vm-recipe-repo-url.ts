import { stripCredentialsFromMessage } from '../../git/remotes/git-remote-error'
import type { OpenKodoVmRecipe } from '../../workspace-setup/openkodo-yaml-hook-types'

export function getProvisionedRootRecipeRepoUrl(
  checkoutMode: OpenKodoVmRecipe['checkoutMode'],
  remoteUrl: string | undefined
): string | undefined {
  if (checkoutMode !== 'provisioned-root' || !remoteUrl) {
    return undefined
  }
  return stripCredentialsFromMessage(remoteUrl)
}
