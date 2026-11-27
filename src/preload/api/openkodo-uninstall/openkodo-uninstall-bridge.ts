import { ipcRenderer } from 'electron'
import type {
  OpenKodoUninstallFinishAction,
  OpenKodoUninstallPlan,
  OpenKodoUninstallRunStepArgs
} from '../../../shared/uninstall/openkodo-uninstall-types'
import type { PreloadApi } from '../../api-types'

export const openkodoUninstallApi = {
  getPlan: (): Promise<OpenKodoUninstallPlan> => ipcRenderer.invoke('openkodoUninstall:getPlan'),
  runStep: (args: OpenKodoUninstallRunStepArgs): Promise<OpenKodoUninstallPlan> =>
    ipcRenderer.invoke('openkodoUninstall:runStep', args),
  finish: (action: OpenKodoUninstallFinishAction): Promise<void> =>
    ipcRenderer.invoke('openkodoUninstall:finish', action)
} satisfies PreloadApi['openkodoUninstall']
