import { OrchestrationError } from '../../orchestration-error'
import { BOT_ITEM_MAIL_SENDER } from '../../../../../shared/bots/bot-item-note-runs'

export type OpenKodoAuthoredMail = 'item-mail' | 'bot-request'

/** The sender and payload of mail some caller wrote: it may not pose as OpenKodo's own item mail or
 *  carry a bot request's field, which make a receiver admit the payload's image paths. */
export function callerMailProvenance(msg: {
  from: string
  payload?: string
  openkodoAuthored?: OpenKodoAuthoredMail
}): string | undefined {
  const { from, payload, openkodoAuthored } = msg
  if (openkodoAuthored === 'item-mail') {
    return payload
  }
  if (from === BOT_ITEM_MAIL_SENDER) {
    throw new OrchestrationError(
      'invalid_argument',
      `${BOT_ITEM_MAIL_SENDER} is OpenKodo's own sender.`
    )
  }
  if (openkodoAuthored === 'bot-request' || !payload) {
    return payload
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    return payload
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !('botRequest' in parsed)) {
    return payload
  }
  return JSON.stringify(
    Object.fromEntries(Object.entries(parsed).filter(([key]) => key !== 'botRequest'))
  )
}
