// How a bot's host that isn't signed in to OpenKodo Cloud reads, and how it signs in. A headless OpenKodo server has
// no Settings of its own: it signs in with `openkodo auth login` there, or from the bot's Connectors tab
// in OpenKodo on the owner's computer, which runs the same sign-in on the server.

/**
 * Whether a host's link to OpenKodo Cloud waits on its OpenKodo sign-in: signed out, or signed in with a sign-in
 * OpenKodo Cloud refuses (`needs-sign-in`). Either way nothing reaches its bots until it signs in again.
 */
export function openkodoCloudNeedsSignIn(status: string | null | undefined): boolean {
  return status === 'signed-out' || status === 'needs-sign-in'
}

/** The headless OpenKodo server's hostname, as `openkodo auth login` and its approval page name it; null on a
 *  computer with OpenKodo's window, which signs in from its own Settings; undefined when an older host
 *  didn't say which it is. */
export type OpenKodoSignInServer = string | null | undefined

/** "This computer" or "This OpenKodo server (box1)". */
export function thisHost(server: OpenKodoSignInServer): string {
  return server ? `This OpenKodo server (${server})` : 'This computer'
}

/** "This computer isn't signed in to cloud service" (signed out, or a sign-in OpenKodo Cloud refuses), or
 *  "This OpenKodo server (box1) isn't signed in to cloud service". */
export function hostNotSignedIn(server: OpenKodoSignInServer): string {
  return `${thisHost(server)} isn't signed in to cloud service`
}

/**
 * How a headless server signs in, for the bot to relay (`bot`) or for its owner to read (`owner`);
 * null on a computer with OpenKodo's window. Only the owner signs in: whoever approves picks the account.
 */
export function serverSignInSteps(
  server: OpenKodoSignInServer,
  botName: string,
  reader: 'bot' | 'owner'
): string | null {
  if (!server) {
    return null
  }
  // A sign-in OpenKodo Cloud refuses is still signed in on the server, where only --switch starts again.
  const command = `\`openkodo auth login\` in a terminal on ${server} (\`openkodo auth login --switch\` if it says the server is already signed in)`
  return reader === 'bot'
    ? `Your owner can sign it in by running ${command}, or with Sign in on ${botName}'s Connectors tab in OpenKodo on their computer.`
    : `Run ${command}, or use Sign in on ${botName}'s Connectors tab in OpenKodo on your computer.`
}

/** For a host that didn't say whether it has a window (an older one): how it signs in if it has none. */
export function unknownHostSignInHint(server: OpenKodoSignInServer): string | null {
  return server === undefined
    ? 'On a server with no OpenKodo window, `openkodo auth login` on it signs it in.'
    : null
}

/** `text`, then how a headless server signs in when the host is one. */
export function withServerSignInSteps(
  text: string,
  server: OpenKodoSignInServer,
  botName: string,
  reader: 'bot' | 'owner'
): string {
  const steps = serverSignInSteps(server, botName, reader)
  return steps ? `${text} ${steps}` : text
}
