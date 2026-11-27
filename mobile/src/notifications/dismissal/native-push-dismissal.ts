import type { OpenKodoPushPayload } from '../payload-identity/push-payload'

export type NativeDismissal = {
  rememberAll(payloads: readonly OpenKodoPushPayload[]): Promise<void>
  wasDismissed(payload: OpenKodoPushPayload): Promise<boolean>
}
// Android and web use JavaScript storage; iOS requires the native ledger.
export const nativePushDismissal: NativeDismissal | null = null
