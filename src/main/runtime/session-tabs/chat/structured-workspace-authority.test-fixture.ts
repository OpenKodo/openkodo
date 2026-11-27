import type { OpenKodoRuntimeService } from '../../openkodo-runtime'

export const availableRevealWorkspace: OpenKodoRuntimeService['prepareStructuredAgentSessionRevealWorkspace'] =
  async () => ({
    current: () => true,
    check: () => {},
    release: Object.assign(() => {}, { isCurrent: () => true })
  })
