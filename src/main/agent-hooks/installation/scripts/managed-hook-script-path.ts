import { openKodoHomePath } from '../../../../shared/home/openkodo-home'
import { join } from 'node:path'

// Parallel OpenKodo instances must share one user-wide script path.
export function getSharedManagedScriptPath(scriptFileName: string): string {
  return join(openKodoHomePath(), 'agent-hooks', scriptFileName)
}
