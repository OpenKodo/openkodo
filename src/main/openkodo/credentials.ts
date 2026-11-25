import { createEncryptedApiKeyFileStore } from '../credentials/encrypted-api-key-file-store'

// One credential per install, encrypted with the OS keychain like the other
// provider keys. Only the API key is stored; plan and quota are fetched live.
const store = createEncryptedApiKeyFileStore({
  fileName: 'openkodo-key',
  envelopePrefix: 'orca:openkodo:',
  providerLabel: 'OpenKodo',
  logScope: '[openkodo]'
})

export const hasOpenKodoKey = (): Promise<boolean> => store.has()
export const readOpenKodoKey = (): Promise<string | null> => store.read()
export const saveOpenKodoKey = (key: string): Promise<void> => store.save(key)
export const clearOpenKodoKey = (): Promise<void> => store.clear()
