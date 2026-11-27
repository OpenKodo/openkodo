// Remember repeatable deployment refusals per app version; host-fixable settings must be reprobed.

export class OpenkododHostUnsupportedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OpenkododHostUnsupportedError'
  }
}

export class OpenkododArtifactsUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OpenkododArtifactsUnavailableError'
  }
}

export class OpenkododStdioBridgeUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OpenkododStdioBridgeUnavailableError'
  }
}

export const OPENKODOD_TUNNEL_UNAVAILABLE_REASON = 'ssh_tunnel_unavailable'
export const OPENKODOD_WINDOWS_LAUNCH_REFUSED_CODE = 'openkodod_windows_launch_refused'
export const OPENKODOD_WINDOWS_COMMAND_LINE_UNSAFE_CODE = 'openkodod_windows_command_line_unsafe'

export type OpenkododHostUnavailableReason =
  | 'unsupported_host'
  | 'artifacts_unavailable'
  | 'libc_unidentified'
  | 'runtime_self_test'
  | 'runtime_noexec'
  | 'windows_build_unsupported'
  | 'windows_no_extractor'
  | 'security_software'
  | 'native_preflight'
  | typeof OPENKODOD_TUNNEL_UNAVAILABLE_REASON

const UNAVAILABLE_BY_ERROR_NAME: Record<string, OpenkododHostUnavailableReason> = {
  OpenkododHostUnsupportedError: 'unsupported_host',
  OpenkododArtifactsUnavailableError: 'artifacts_unavailable',
  OpenkododRemoteLaunchUnsupportedError: 'unsupported_host',
  UnidentifiedHostLibcError: 'libc_unidentified',
  RemoteNodeRuntimeSelfTestError: 'runtime_self_test',
  RemoteNodeRuntimeNoexecError: 'runtime_noexec',
  RemoteWindowsBuildUnsupportedError: 'windows_build_unsupported',
  RemoteNodeRuntimeNoExtractorError: 'windows_no_extractor',
  RemoteNodeRuntimeSecurityModifiedError: 'security_software',
  OpenkododStdioBridgeUnavailableError: OPENKODOD_TUNNEL_UNAVAILABLE_REASON,
  OpenkododWindowsLaunchRefusedError: 'unsupported_host',
  OpenkododWindowsCommandLineError: 'unsupported_host'
}

// Native preflight, PTY self-test and permanent Windows refusals repeat; transient races do not.
const UNAVAILABLE_BY_DEFERRAL_CODE: Record<string, OpenkododHostUnavailableReason> = {
  openkodod_candidate_preflight_failed: 'native_preflight',
  openkodod_activation_pty_self_test_failed: 'native_preflight',
  [OPENKODOD_WINDOWS_LAUNCH_REFUSED_CODE]: 'unsupported_host',
  [OPENKODOD_WINDOWS_COMMAND_LINE_UNSAFE_CODE]: 'unsupported_host'
}

// Reprobed on every connect, so fixing or upgrading the host needs no new OpenKodo version.
const FIXABLE_ON_HOST: ReadonlySet<string> = new Set<OpenkododHostUnavailableReason>([
  'runtime_noexec',
  'windows_build_unsupported',
  'windows_no_extractor'
])

export function isOpenkododHostUnavailableFixableOnHost(reason: string): boolean {
  return FIXABLE_ON_HOST.has(reason)
}

export function openkododCandidateLaunchFailureCode(error: unknown): string {
  const code = error instanceof Error && 'code' in error ? error.code : undefined
  return code === OPENKODOD_WINDOWS_LAUNCH_REFUSED_CODE ||
    code === OPENKODOD_WINDOWS_COMMAND_LINE_UNSAFE_CODE
    ? code
    : 'openkodod_candidate_launch_failed'
}

export function classifyOpenkododHostUnavailable(
  failure: unknown
): OpenkododHostUnavailableReason | null {
  if (failure instanceof Error) {
    return UNAVAILABLE_BY_ERROR_NAME[failure.name] ?? null
  }
  if (failure && typeof failure === 'object' && 'code' in failure) {
    const code = failure.code
    return typeof code === 'string' ? (UNAVAILABLE_BY_DEFERRAL_CODE[code] ?? null) : null
  }
  return null
}
