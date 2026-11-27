// Always report available to prevent plaintext fallback; throw on seal/unseal when the key is unavailable.
import type { SecretStore } from '../../../shared/secure-storage/secret-store'
import { sweepStaleRecordStaging } from './openkodod-secret-key-record'
import {
  openkododSecretStatePath,
  resolveState,
  type OpenkododSecretStorePrepareOptions,
  type StoreState
} from './openkodod-secret-key-resolution'
import { openOpenkododSecret, sealOpenkododSecret } from './openkodod-secret-sealing'
import { describeOpenkododHostKeyGap } from './openkodod-secret-protection-gap'

export type OpenkododSecretStore = SecretStore & {
  prepare(options: OpenkododSecretStorePrepareOptions): Promise<boolean>
}

export function createOpenkododSecretStore(
  log: (message: string) => void = (message) => console.warn(message)
): OpenkododSecretStore {
  let state: StoreState = { kind: 'pending' }
  const readyKey = (): Buffer => {
    if (state.kind === 'ready') {
      return state.key
    }
    throw new Error(
      state.kind === 'unavailable'
        ? state.message
        : 'openkodod_secret_store_not_prepared — the headless secret store has not loaded its key yet'
    )
  }
  return {
    isEncryptionAvailable: () => state.kind !== 'plaintext',
    encryptString: (plainText) => sealOpenkododSecret(readyKey(), plainText),
    decryptString: (cipher) => openOpenkododSecret(readyKey(), cipher),
    describeProtectionGap: () => {
      switch (state.kind) {
        case 'ready':
          return state.gap
        case 'unavailable':
          return state.message
        case 'plaintext':
          return state.reason
        case 'pending':
          return "OpenKodo's headless server has not loaded its credential key yet."
      }
    },
    describeSealing: () => {
      switch (state.kind) {
        case 'ready':
          return { kind: 'host-key', warning: state.gap ?? describeOpenkododHostKeyGap(false) }
        case 'unavailable':
          return { kind: 'none', reason: state.message }
        case 'plaintext':
          return { kind: 'none', reason: state.reason }
        case 'pending':
          return {
            kind: 'none',
            reason: "OpenKodo's headless server has not loaded its credential key yet."
          }
      }
    },
    async prepare(next) {
      sweepStaleRecordStaging(openkododSecretStatePath(next))
      state = await resolveState(next, log)
      return state.kind === 'ready'
    }
  }
}
