// Host-advertised: openkodoAccount.* lets a client sign this host's OpenKodo account in and out.
export const OPENKODO_ACCOUNT_SERVER_SIGN_IN_RUNTIME_CAPABILITY =
  'openkodo-account.server-sign-in.v1' as const

// Host-advertised: `openkodoAccount.signIn.start` takes `approveInBrowser`, so nothing is pasted back.
export const OPENKODO_ACCOUNT_APPROVE_IN_BROWSER_RUNTIME_CAPABILITY =
  'openkodo-account.server-sign-in.approve-in-browser.v1' as const
