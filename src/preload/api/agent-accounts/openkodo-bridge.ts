import { ipcRenderer } from 'electron'
import type { PreloadApi } from '../../api-types'

export const openkodoApi = {
  status: () => ipcRenderer.invoke('openkodo:status'),
  loginStart: () => ipcRenderer.invoke('openkodo:loginStart'),
  loginBrowser: () => ipcRenderer.invoke('openkodo:loginBrowser'),
  loginState: () => ipcRenderer.invoke('openkodo:loginState'),
  logout: () => ipcRenderer.invoke('openkodo:logout'),
  usage: () => ipcRenderer.invoke('openkodo:usage')
} satisfies PreloadApi['openkodo']
