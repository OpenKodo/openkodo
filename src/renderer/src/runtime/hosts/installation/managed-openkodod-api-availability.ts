import type { ManagedOpenkododPreloadApi } from '../../../../../preload/api/runtime/managed-openkodod-api'
import { isWebClientLocation } from '@/app-shell/platform/web-client-location'

/** Web fallback stubs cannot manage SSH hosts. */
export function getManagedOpenkododApi(): ManagedOpenkododPreloadApi | undefined {
  return isWebClientLocation() ? undefined : window.api.runtimeEnvironments.managedOpenkodod
}
