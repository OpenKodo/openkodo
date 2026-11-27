import { translate } from '@/i18n/i18n'
import {
  NATIVE_CHAT_OPENKODO_STOP_COPY as COPY,
  type NativeChatOpenKodoStopCopyId,
  type NativeChatOpenKodoStopSay
} from '../../../../../../shared/native-chat/transcript/continuation/native-chat-openkodo-stop-words'

const PIECES: Record<NativeChatOpenKodoStopCopyId, (machine: string | undefined) => string> = {
  update: (machine) =>
    translate('components.native-chat.notices.openkodoStopUpdate', COPY.update, { machine }),
  quit: (machine) =>
    translate('components.native-chat.notices.openkodoStopQuit', COPY.quit, { machine }),
  crash: (machine) =>
    translate('components.native-chat.notices.openkodoStopCrash', COPY.crash, { machine }),
  remote: (machine) =>
    translate('components.native-chat.notices.openkodoStopRemote', COPY.remote, { machine }),
  canContinue: () =>
    translate('components.native-chat.notices.openkodoStopCanContinue', COPY.canContinue),
  unnamedServer: () =>
    translate('components.native-chat.notices.openkodoStopUnnamedServer', COPY.unnamedServer)
}

export const sayNativeChatOpenKodoStopTranslated: NativeChatOpenKodoStopSay = (id, machine) =>
  PIECES[id](machine)
