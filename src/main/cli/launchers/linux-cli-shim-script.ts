import { quotePosixShellDoubleQuotedApostrophe } from '../../../shared/shell/launch/shell-argument-quoting'

/** A managed terminal's `openkodo` entry, resolved to this app's bundled launcher. */
export function buildBundledCliShimScript(launcherPath: string): string {
  return `#!/usr/bin/env bash\nexec ${quotePosixShellDoubleQuotedApostrophe(launcherPath)} "$@"\n`
}
