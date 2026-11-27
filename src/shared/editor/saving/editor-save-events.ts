export const OPENKODO_EDITOR_SAVE_DIRTY_FILES_EVENT = 'openkodo:editor-save-dirty-files'
export const OPENKODO_EDITOR_PREPARE_HOT_EXIT_EVENT = 'openkodo:editor-prepare-hot-exit'

export type EditorSaveDirtyFilesDetail = {
  claim: () => void
  resolve: () => void
  reject: (message: string) => void
}

export type EditorPrepareHotExitDetail = EditorSaveDirtyFilesDetail
