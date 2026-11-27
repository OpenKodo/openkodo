// The OpenKodo profile this openkodod opened at startup, which it serves for the process's life.

let served: string | null = null

export function recordOpenkododServedProfile(profileId: string): void {
  served = profileId
}

/** Null before a profile opens: nothing is served yet. */
export function openkododServedProfileId(): string | null {
  return served
}
