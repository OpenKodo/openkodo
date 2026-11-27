import type { OpenkododManagedRuntimeStatus } from '../../shared/remote-runtime/openkodod-lifecycle/openkodod-managed-runtime'

function count(value: number | null): string {
  return value === null ? 'unverifiable' : String(value)
}

export function formatManagedServerStatus(status: OpenkododManagedRuntimeStatus): string {
  const lines = [
    `Active version: ${status.activeVersion ?? 'none'}${status.activeAppVersion ? ` (OpenKodo ${status.activeAppVersion})` : ''}`,
    `Previous version: ${status.previousVersion ?? 'none'}${status.rollbackAvailable ? ' (rollback available)' : ''}`,
    `Live terminals: ${count(status.terminals.liveSessions)}`
  ]
  if (status.recovery) {
    lines.push(
      `Interrupted ${status.recovery.operation} of ${status.recovery.version} (${status.recovery.phase}); run \`openkodo environment recover\`.`
    )
  }
  if (status.migration) {
    lines.push(`Migration into this server: ${status.migration.phase}`)
  }
  if (status.deferredUpdate) {
    lines.push(
      `Deferred update to ${status.deferredUpdate.candidateVersion}: ${status.deferredUpdate.reason}`
    )
  }
  if (status.availableUpdate) {
    lines.push(
      `Update available: ${status.availableUpdate}; run \`openkodo environment update --environment ${status.environmentId}\`.`
    )
  }
  return lines.join('\n')
}
