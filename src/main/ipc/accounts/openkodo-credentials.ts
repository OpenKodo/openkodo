import { ipcMain } from 'electron'
import {
  getOpenKodoLoginState,
  getOpenKodoStatus,
  getOpenKodoUsage,
  logoutOpenKodo,
  startOpenKodoBrowserLogin,
  startOpenKodoLogin
} from '../../openkodo/login'

export function registerOpenKodoHandlers(): void {
  ipcMain.handle('openkodo:status', () => getOpenKodoStatus())
  ipcMain.handle('openkodo:loginStart', () => startOpenKodoLogin())
  ipcMain.handle('openkodo:loginBrowser', () => startOpenKodoBrowserLogin())
  ipcMain.handle('openkodo:loginState', () => getOpenKodoLoginState())
  ipcMain.handle('openkodo:logout', () => logoutOpenKodo())
  ipcMain.handle('openkodo:usage', () => getOpenKodoUsage())
}
