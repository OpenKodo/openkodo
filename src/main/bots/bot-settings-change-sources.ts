import { onBotToolSignInChanged } from './bot-tool-sign-in-changed'
import { onBotToolCredentialEnded } from './bot-tool-credential-ended'

/** What a bot's settings rows show that changes outside its settings: setup cards re-read the bot's
 *  tool rows re-read on a sign-in or a credential that ends (a tool removed, a
 *  sign-in replaced). Returns the stops. */
export function watchBotSettingsChangeSources(changed: () => void): (() => void)[] {
  return [onBotToolSignInChanged(() => changed()), onBotToolCredentialEnded(changed)]
}
