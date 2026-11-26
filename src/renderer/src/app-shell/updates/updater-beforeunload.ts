import {
  OPENKODO_APP_RESTART_ABORTED_EVENT,
  OPENKODO_APP_RESTART_STARTED_EVENT,
  OPENKODO_UPDATER_QUIT_AND_INSTALL_ABORTED_EVENT,
  OPENKODO_UPDATER_QUIT_AND_INSTALL_STARTED_EVENT
} from '../../../../shared/updater/updater-renderer-events'
import { OPENKODO_RENDERER_SHUTDOWN_CHECKPOINT_ABORTED_EVENT } from '../../../../shared/app-lifecycle/shutdown/renderer-shutdown-events'

let intentionalAppRestartInProgress = false

export function isIntentionalAppRestartInProgress(): boolean {
  return intentionalAppRestartInProgress
}

export function registerUpdaterBeforeUnloadBypass(): () => void {
  const markInProgress = (): void => {
    intentionalAppRestartInProgress = true
  }
  const clearInProgress = (): void => {
    intentionalAppRestartInProgress = false
  }

  window.addEventListener(OPENKODO_UPDATER_QUIT_AND_INSTALL_STARTED_EVENT, markInProgress)
  window.addEventListener(OPENKODO_UPDATER_QUIT_AND_INSTALL_ABORTED_EVENT, clearInProgress)
  window.addEventListener(OPENKODO_APP_RESTART_STARTED_EVENT, markInProgress)
  window.addEventListener(OPENKODO_APP_RESTART_ABORTED_EVENT, clearInProgress)
  window.addEventListener(OPENKODO_RENDERER_SHUTDOWN_CHECKPOINT_ABORTED_EVENT, clearInProgress)

  return () => {
    window.removeEventListener(OPENKODO_UPDATER_QUIT_AND_INSTALL_STARTED_EVENT, markInProgress)
    window.removeEventListener(OPENKODO_UPDATER_QUIT_AND_INSTALL_ABORTED_EVENT, clearInProgress)
    window.removeEventListener(OPENKODO_APP_RESTART_STARTED_EVENT, markInProgress)
    window.removeEventListener(OPENKODO_APP_RESTART_ABORTED_EVENT, clearInProgress)
    window.removeEventListener(OPENKODO_RENDERER_SHUTDOWN_CHECKPOINT_ABORTED_EVENT, clearInProgress)
    // HMR can re-register listeners; cleanup must reset the flag so failed restarts cannot suppress later unsaved-change prompts.
    intentionalAppRestartInProgress = false
  }
}
