'use strict'

let addon = null
function getFocusAssistState() {
  addon ??= require('./build/Release/openkodo_windows_notifications.node')
  return addon.getFocusAssistState()
}

module.exports = { getFocusAssistState }
