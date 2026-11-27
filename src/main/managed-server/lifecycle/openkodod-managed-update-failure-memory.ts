// Remember failures only for this session so restarting retries once.
export type OpenkododUpdateFailureHost = { kind: 'ssh' | 'wsl'; id: string }

export type OpenkododUpdateFailure = { code: string; reason: string }

const failedThisLaunch = new Map<string, OpenkododUpdateFailure>()

function key(host: OpenkododUpdateFailureHost): string {
  return `${host.kind}:${host.id}`
}

export function recordOpenkododUpdateFailedThisLaunch(
  host: OpenkododUpdateFailureHost,
  failure: OpenkododUpdateFailure
): void {
  failedThisLaunch.set(key(host), failure)
}

export function openkododUpdateFailureThisLaunch(
  host: OpenkododUpdateFailureHost
): OpenkododUpdateFailure | null {
  return failedThisLaunch.get(key(host)) ?? null
}

export function openkododUpdateFailedThisLaunch(host: OpenkododUpdateFailureHost): boolean {
  return failedThisLaunch.has(key(host))
}

export function clearOpenkododUpdateFailedThisLaunch(host: OpenkododUpdateFailureHost): void {
  failedThisLaunch.delete(key(host))
}
