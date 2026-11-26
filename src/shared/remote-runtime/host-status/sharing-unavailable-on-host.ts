// Only the signed-in desktop app registers OpenKodo cloud services; headless hosts refuse them by name (#33593).
export const SHARING_UNAVAILABLE_ON_HOST_CODE = 'sharing_unavailable_on_host' as const

export const SHARING_UNAVAILABLE_ON_HOST_MESSAGE =
  "OpenKodo cloud features like sharing aren't available on headless OpenKodo servers yet. Use the OpenKodo desktop app for this."

export const SHARING_UNAVAILABLE_ON_HOST_NEXT_STEPS: readonly string[] = [
  'Open the OpenKodo desktop app, sign in, and run the command from an OpenKodo terminal there.'
]

export class SharingUnavailableOnHostError extends Error {
  readonly code = SHARING_UNAVAILABLE_ON_HOST_CODE
  readonly data = { nextSteps: [...SHARING_UNAVAILABLE_ON_HOST_NEXT_STEPS] }

  constructor() {
    super(SHARING_UNAVAILABLE_ON_HOST_MESSAGE)
    this.name = 'SharingUnavailableOnHostError'
  }
}
