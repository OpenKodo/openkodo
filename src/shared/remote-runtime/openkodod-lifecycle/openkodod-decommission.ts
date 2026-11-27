import type { OpenkododManagedRefusal } from './openkodod-managed-runtime'
import type { OpenkododDaemonRetirementVerdict } from './openkodod-stop-request'

export type OpenkododDecommissionResult =
  | {
      outcome: 'decommissioned'
      version: string
      /** The daemon's fate: `retired`, or kept with its terminals (`live`/`unverifiable`). */
      retirement: OpenkododDaemonRetirementVerdict
    }
  | OpenkododManagedRefusal
