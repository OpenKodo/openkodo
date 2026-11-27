import type { OpenKodoRuntimeService } from '../../../openkodo-runtime'
import type { StructuredSessionSurfaceRuntime } from '../../../agent-session/lifecycle/structured-agent-session-close'

export type WorkerTerminalReleaseRuntime = StructuredSessionSurfaceRuntime &
  Pick<
    OpenKodoRuntimeService,
    | 'forgetStructuredSessionMail'
    | 'resolveOrchestrationWorkerServer'
    | 'callOrchestrationWorkerServer'
    | 'getOrchestrationFleetAgentStatusSnapshot'
    | 'getOrchestrationDb'
    | 'getExistingOrchestrationDb'
    | 'showTerminal'
    | 'resolveTerminalHandleByProcessIncarnation'
    | 'getTerminalPaneKey'
    | 'getTerminalHandleForPaneKey'
    | 'getTerminalProcessIncarnation'
    | 'getTerminalLivenessVerdict'
    | 'checkTerminalAgentPresence'
    | 'getOrchestrationDispatchAuthority'
    | 'ensureStructuredAgentSessionHost'
    | 'inspectTerminalProcessIncarnationLiveness'
    | 'closeTerminal'
    | 'isSetupTerminalRunning'
    | 'getExactWorkerProviderSession'
    | 'readTerminal'
    | 'notifyMessageArrived'
    | 'isWorkerAgentInTurn'
  > &
  // Lower runtime layers declare neither; without them a release closes its chat.
  Partial<
    Pick<
      OpenKodoRuntimeService,
      'sleepWorkspaces' | 'bots' | 'listMobileSessionTabs' | 'savedTabsForWorktree'
    >
  >
