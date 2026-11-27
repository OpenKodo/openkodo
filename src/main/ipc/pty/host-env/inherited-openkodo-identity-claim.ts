// Imported first by openkodod's entries (esbuild runs it first); the built Electron main and daemon drop
// the same keys from their banner (config/build-plugins/inherited-openkodo-identity-banner.ts).
import { dropInheritedOpenKodoIdentityEnv } from './inherited-openkodo-identity-env'

dropInheritedOpenKodoIdentityEnv()
