import { posixCurlCommand } from '../agent-hooks/installation/scripts/hook-post-command'
import { OPENKODO_AGENT_HOOKS_DISABLED_ENV } from '../../shared/agent-hook-listener/transport/agent-hook-suppression-env'
import { buildPosixScrubSafeEnvRestoreLines } from '../../shared/agent-hook-listener/transport/agent-hook-scrub-safe-env'
import { buildWindowsAgentHookPostCommand } from '../agent-hooks/installation/commands/windows-agent-hook-post-command'
import {
  buildPosixHookPayloadCapture,
  buildPosixHookSpoolLines,
  buildWindowsHookEnvironmentGuardLines
} from '../agent-hooks/installation/scripts/hook-stdin-contract'

export type CommandCodeManagedScriptTarget = 'local' | 'posix'

export function buildCommandCodeManagedScript(
  target: CommandCodeManagedScriptTarget = 'local'
): string {
  if (target === 'local' && process.platform === 'win32') {
    return [
      '@echo off',
      'setlocal',
      `if "%${OPENKODO_AGENT_HOOKS_DISABLED_ENV}%"=="1" exit /b 0`,
      'if "%OPENKODO_AGENT_HOOK_PORT%"=="" if defined OPENKODO_AGENT_HOOK_ENDPOINT if exist "%OPENKODO_AGENT_HOOK_ENDPOINT%" call "%OPENKODO_AGENT_HOOK_ENDPOINT%" 2>nul',
      'if "%OPENKODO_AGENT_HOOK_TOKEN%"=="" if not "%OPENKODO_AGENT_HOOK_PORT%"=="" call :sourceEndpointByPort',
      ...buildWindowsHookEnvironmentGuardLines(),
      buildWindowsAgentHookPostCommand('command-code'),
      'exit /b 0',
      ':sourceEndpointByPort',
      'if not defined APPDATA exit /b 0',
      'if exist "%APPDATA%\\openkodo-dev\\agent-hooks" for /r "%APPDATA%\\openkodo-dev\\agent-hooks" %%F in (endpoint.cmd) do call :maybeSourceEndpoint "%%~fF"',
      // Per-worktree `pnpm dev` profiles live one level down; FOR /R cannot take a FOR variable as its root.
      'if "%OPENKODO_AGENT_HOOK_TOKEN%"=="" if exist "%APPDATA%\\openkodo-dev-wt" for /d %%P in ("%APPDATA%\\openkodo-dev-wt\\*") do call :scanEndpointDir "%%~fP\\agent-hooks"',
      'if "%OPENKODO_AGENT_HOOK_TOKEN%"=="" if exist "%APPDATA%\\openkodo\\agent-hooks" for /r "%APPDATA%\\openkodo\\agent-hooks" %%F in (endpoint.cmd) do call :maybeSourceEndpoint "%%~fF"',
      'exit /b 0',
      ':scanEndpointDir',
      'if not "%OPENKODO_AGENT_HOOK_TOKEN%"=="" exit /b 0',
      'if exist "%~1" for /r "%~1" %%F in (endpoint.cmd) do call :maybeSourceEndpoint "%%~fF"',
      'exit /b 0',
      ':maybeSourceEndpoint',
      'if not "%OPENKODO_AGENT_HOOK_TOKEN%"=="" exit /b 0',
      'for /f "tokens=2 delims==" %%P in (\'findstr /b /c:"set OPENKODO_AGENT_HOOK_PORT=" "%~1" 2^>nul\') do if "%%P"=="%OPENKODO_AGENT_HOOK_PORT%" call "%~1" 2>nul',
      'exit /b 0',
      ''
    ].join('\r\n')
  }

  return [
    '#!/bin/sh',
    // Command Code strips TOKEN-named variables from hook env; pane identity survives.
    ...buildPosixScrubSafeEnvRestoreLines(),
    ...buildPosixHookPayloadCapture(),
    `if [ "\${${OPENKODO_AGENT_HOOKS_DISABLED_ENV}:-}" = 1 ]; then exit 0; fi`,
    ...buildPosixHookSpoolLines('command-code'),
    '__openkodo_read_ancestor_var() {',
    '  __openkodo_name="$1"',
    '  __openkodo_pid="${PPID:-}"',
    '  while [ -n "$__openkodo_pid" ] && [ "$__openkodo_pid" != "0" ] && [ "$__openkodo_pid" != "1" ]; do',
    '    __openkodo_env=""',
    '    if [ -r "/proc/$__openkodo_pid/environ" ]; then',
    '      __openkodo_env=$(tr "\\000" "\\n" < "/proc/$__openkodo_pid/environ" 2>/dev/null)',
    '    fi',
    '    if [ -z "$__openkodo_env" ]; then',
    '      __openkodo_env=$(ps eww -p "$__openkodo_pid" -o command= 2>/dev/null | tr " " "\\n")',
    '    fi',
    // A scrubbed hook may recover identity, but must never cross a background launch.
    `    if printf '%s\\n' "$__openkodo_env" | grep -qx '${OPENKODO_AGENT_HOOKS_DISABLED_ENV}=1'; then return 1; fi`,
    '    __openkodo_value=$(printf "%s\\n" "$__openkodo_env" | sed -n "s/^${__openkodo_name}=//p" | head -n 1)',
    '    if [ -n "$__openkodo_value" ]; then',
    '      printf "%s\\n" "$__openkodo_value"',
    '      return 0',
    '    fi',
    '    __openkodo_pid=$(ps -o ppid= -p "$__openkodo_pid" 2>/dev/null | tr -d " ")',
    '  done',
    '  return 1',
    '}',
    '__openkodo_fill_token_from_ancestor() {',
    '  __openkodo_value=$(__openkodo_read_ancestor_var OPENKODO_AGENT_HOOK_TOKEN) || return 0',
    '  [ -n "$__openkodo_value" ] && export "OPENKODO_AGENT_HOOK_TOKEN=$__openkodo_value"',
    '}',
    '__openkodo_endpoint_value() {',
    '  __openkodo_endpoint_name="$1"',
    '  __openkodo_endpoint_path="$2"',
    '  sed -n "s/^${__openkodo_endpoint_name}=//p" "$__openkodo_endpoint_path" 2>/dev/null | head -n 1',
    '}',
    '__openkodo_fill_from_endpoint_file() {',
    '  __openkodo_endpoint_path="$1"',
    '  [ -r "$__openkodo_endpoint_path" ] || return 0',
    '  __openkodo_endpoint_port=$(__openkodo_endpoint_value OPENKODO_AGENT_HOOK_PORT "$__openkodo_endpoint_path")',
    '  if [ -n "${OPENKODO_AGENT_HOOK_PORT:-}" ] && [ -n "$__openkodo_endpoint_port" ] && [ "$__openkodo_endpoint_port" != "$OPENKODO_AGENT_HOOK_PORT" ]; then',
    '    return 0',
    '  fi',
    '  for __openkodo_endpoint_name in OPENKODO_AGENT_HOOK_PORT OPENKODO_AGENT_HOOK_TOKEN OPENKODO_AGENT_HOOK_ENV OPENKODO_AGENT_HOOK_VERSION; do',
    '    eval "__openkodo_current=\\${$__openkodo_endpoint_name:-}"',
    '    [ -z "$__openkodo_current" ] || continue',
    '    __openkodo_endpoint_value=$(__openkodo_endpoint_value "$__openkodo_endpoint_name" "$__openkodo_endpoint_path")',
    '    [ -n "$__openkodo_endpoint_value" ] && export "$__openkodo_endpoint_name=$__openkodo_endpoint_value"',
    '  done',
    '}',
    'if [ -n "$OPENKODO_AGENT_HOOK_ENDPOINT" ] && [ -r "$OPENKODO_AGENT_HOOK_ENDPOINT" ]; then',
    '  __openkodo_fill_from_endpoint_file "$OPENKODO_AGENT_HOOK_ENDPOINT"',
    'fi',
    '# Recover stripped token metadata by matching the preserved loopback port.',
    'if [ -z "$OPENKODO_AGENT_HOOK_TOKEN" ] && [ -n "$OPENKODO_AGENT_HOOK_PORT" ]; then',
    '  for endpoint in \\',
    '    "$HOME/Library/Application Support/openkodo-dev/agent-hooks"/*/endpoint.env \\',
    '    "$HOME/Library/Application Support/openkodo-dev/agent-hooks/endpoint.env" \\',
    '    "${XDG_CONFIG_HOME:-$HOME/.config}/openkodo-dev/agent-hooks"/*/endpoint.env \\',
    '    "${XDG_CONFIG_HOME:-$HOME/.config}/openkodo-dev/agent-hooks/endpoint.env" \\',
    '    "$HOME/Library/Application Support/openkodo-dev-wt"/*/agent-hooks/*/endpoint.env \\',
    '    "${XDG_CONFIG_HOME:-$HOME/.config}/openkodo-dev-wt"/*/agent-hooks/*/endpoint.env \\',
    '    "$HOME/Library/Application Support/openkodo/agent-hooks/endpoint.env" \\',
    '    "${XDG_CONFIG_HOME:-$HOME/.config}/openkodo/agent-hooks/endpoint.env"; do',
    '    [ -r "$endpoint" ] || continue',
    '    endpoint_port=$(sed -n "s/^OPENKODO_AGENT_HOOK_PORT=//p" "$endpoint" | head -n 1)',
    '    if [ "$endpoint_port" = "$OPENKODO_AGENT_HOOK_PORT" ]; then',
    '      __openkodo_fill_from_endpoint_file "$endpoint"',
    '      break',
    '    fi',
    '  done',
    'fi',
    // Last resort for hosts without an endpoint file: read only the token from the parent TUI.
    'if [ -z "$OPENKODO_AGENT_HOOK_TOKEN" ] && [ -n "$OPENKODO_PANE_KEY" ] && [ -n "$OPENKODO_AGENT_HOOK_PORT" ]; then',
    '  __openkodo_fill_token_from_ancestor',
    'fi',
    'if [ -z "$OPENKODO_AGENT_HOOK_PORT" ] || [ -z "$OPENKODO_AGENT_HOOK_TOKEN" ] || [ -z "$OPENKODO_PANE_KEY" ]; then',
    '  spool_hook_event',
    '  exit 0',
    'fi',
    // Bound stalled posts and pipe large payloads through stdin to avoid EDR command-line false positives.
    `printf '%s' "$payload" | ${posixCurlCommand()} -sS -X POST "http://127.0.0.1:\${OPENKODO_AGENT_HOOK_PORT}/hook/command-code" \\`,
    '  --connect-timeout 0.5 --max-time 1.5 \\',
    '  -H "Content-Type: application/x-www-form-urlencoded" \\',
    '  -H "X-OpenKodo-Agent-Hook-Token: ${OPENKODO_AGENT_HOOK_TOKEN}" \\',
    '  --data-urlencode "paneKey=${OPENKODO_PANE_KEY}" \\',
    '  --data-urlencode "tabId=${OPENKODO_TAB_ID}" \\',
    '  --data-urlencode "launchToken=${OPENKODO_AGENT_LAUNCH_TOKEN}" \\',
    '  --data-urlencode "worktreeId=${OPENKODO_WORKTREE_ID}" \\',
    '  --data-urlencode "env=${OPENKODO_AGENT_HOOK_ENV}" \\',
    '  --data-urlencode "version=${OPENKODO_AGENT_HOOK_VERSION}" \\',
    '  --data-urlencode "payload@-" >/dev/null 2>&1 || spool_hook_event',
    'exit 0',
    ''
  ].join('\n')
}
