// An openkodod's browser engine is an OpenKodo app it starts without pairing; openkodod is the caller on its socket.
let launchedAsBrowserEngineSidecar = false

export function markBrowserEngineSidecarLaunch(): void {
  launchedAsBrowserEngineSidecar = true
}

/** True in an openkodod's browser engine, whose runtime calls come from that openkodod, not from agents. */
export function isBrowserEngineSidecarLaunch(): boolean {
  return launchedAsBrowserEngineSidecar
}
