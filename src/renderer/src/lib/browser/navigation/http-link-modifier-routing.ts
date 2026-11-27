/** Shift traditionally forces system browser; the inversion setting instead chooses the other destination when system is already default. */
export function resolveModifierRouting(
  modifierHeld: boolean,
  openLinksInApp: boolean,
  modifierInverts: boolean
): { wantsOpenKodo: boolean; wantsSystemBrowser: boolean } {
  if (!modifierHeld) {
    return { wantsOpenKodo: false, wantsSystemBrowser: false }
  }
  if (!modifierInverts) {
    return { wantsOpenKodo: false, wantsSystemBrowser: true }
  }
  return { wantsOpenKodo: !openLinksInApp, wantsSystemBrowser: openLinksInApp }
}
