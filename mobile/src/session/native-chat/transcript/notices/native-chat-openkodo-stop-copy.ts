import type { NativeChatOpenKodoStopSay } from '../../../../../../src/shared/native-chat/transcript/continuation/native-chat-openkodo-stop-words'
import type { Translate } from '../../../../i18n/mobile-i18n'

export function nativeChatOpenKodoStopSay(t: Translate): NativeChatOpenKodoStopSay {
  return (id, machine) => {
    const copy = {
      update: () =>
        t(
          'chat.openkodoStop.update',
          'OpenKodo on {{machine}} restarted for an update while this response was in progress.',
          { machine }
        ),
      quit: () =>
        t(
          'chat.openkodoStop.quit',
          'OpenKodo on {{machine}} was closed while this response was in progress.',
          { machine }
        ),
      crash: () =>
        t(
          'chat.openkodoStop.crash',
          'OpenKodo on {{machine}} stopped unexpectedly while this response was in progress.',
          { machine }
        ),
      remote: () =>
        t(
          'chat.openkodoStop.remote',
          'OpenKodo on {{machine}} stopped while this response was in progress.',
          { machine }
        ),
      canContinue: () =>
        t('chat.openkodoStop.canContinue', 'You can continue in this conversation.'),
      unnamedServer: () => t('chat.openkodoStop.unnamedServer', 'the remote server')
    }
    return copy[id]()
  }
}
