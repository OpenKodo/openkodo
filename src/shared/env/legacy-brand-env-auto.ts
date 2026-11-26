import { aliasLegacyBrandEnv } from './legacy-brand-env'

// Imported first by every process entry so module-level reads see the values.
aliasLegacyBrandEnv()
