import { join } from 'node:path'
import { prepareOpenkododSecretStore } from '../host-runtime/openkodod-host-adapters'

export async function prepareOpenkododSecretStoreAndMigrate(userDataPath: string): Promise<void> {
  const { getSecretStore } = await import('../../../shared/secure-storage/secret-store')
  const { reportSecretProtectionGap } = await import('../../host/secret-protection-report')
  const { migratePlaintextCredentials, openkododCredentialRoot } =
    await import('./openkodod-plaintext-credential-migration')
  // Keep sealing keys outside disposable OPENKODO_USER_DATA roots.
  if (await prepareOpenkododSecretStore(openkododCredentialRoot(), userDataPath)) {
    await migratePlaintextCredentials(getSecretStore())
  }
  reportSecretProtectionGap({ dataFile: join(userDataPath, 'openkodo-data.json') })
}
