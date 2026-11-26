import { posixCurlCommand } from '../agent-hooks/installation/scripts/hook-post-command'
import { buildHookProcessCapture } from '../agent-hooks/installation/scripts/hook-process-capture'
import {
  buildPosixHookPayloadCapture,
  POSIX_HOOK_JSON_STDIN,
  buildPosixHookSpoolLines,
  buildWindowsHookEnvironmentGuardLines
} from '../agent-hooks/installation/scripts/hook-stdin-contract'
import { WINDOWS_NATIVE_HOOK_EXECUTABLE_NAME } from '../agent-hooks/installation/commands/windows-native-hook-executable'

// Matches ANTIGRAVITY_HANDLED_EXIT_CODE in native/windows-agent-hook/src/main.rs.
const ANTIGRAVITY_NATIVE_HANDLED_EXIT_CODE = 17

export function getManagedScript(
  target: 'local' | 'posix' = 'local',
  windowsRuntimePath = process.execPath
): string {
  if (target === 'local' && process.platform === 'win32') {
    return [
      '@echo off',
      // Delayed expansion corrupts literal ! characters in paths and hook coordinates.
      'setlocal DisableDelayedExpansion',
      'if /I "%OPENKODO_ANTIGRAVITY_EVENT%"=="Stop" (',
      '  echo {"decision":""}',
      ') else if /I not "%OPENKODO_ANTIGRAVITY_EVENT%"=="PreToolUse" (',
      '  echo {}',
      ')',
      'if defined OPENKODO_AGENT_HOOK_ENDPOINT if exist "%OPENKODO_AGENT_HOOK_ENDPOINT%" call "%OPENKODO_AGENT_HOOK_ENDPOINT%" 2>nul',
      ...buildWindowsHookEnvironmentGuardLines(),
      // The native reader skips an Electron start, whose cost under load hit agy's 10 s kill (#41298).
      // Drop its stdout: an older copy prints {}, which agy reads as deny. Only the handled code
      // proves this build read stdin; an older copy (0) or a failed start falls back to Node, and a
      // crash (negative NTSTATUS) may have consumed stdin, so it skips a duplicate post.
      `if exist "%~dp0${WINDOWS_NATIVE_HOOK_EXECUTABLE_NAME}" (`,
      `  "%~dp0${WINDOWS_NATIVE_HOOK_EXECUTABLE_NAME}" antigravity >nul 2>nul`,
      `  if errorlevel ${ANTIGRAVITY_NATIVE_HANDLED_EXIT_CODE} if not errorlevel ${ANTIGRAVITY_NATIVE_HANDLED_EXIT_CODE + 1} exit /b 0`,
      '  if not errorlevel 0 exit /b 0',
      ')',
      'set "ELECTRON_RUN_AS_NODE=1"',
      `if not defined OPENKODO_AGENT_HOOK_NODE set "OPENKODO_AGENT_HOOK_NODE=${windowsRuntimePath.replaceAll('%', '%%')}"`,
      '"%OPENKODO_AGENT_HOOK_NODE%" "%~dp0antigravity-hook-post.cjs" >nul 2>nul',
      'exit /b 0',
      ''
    ].join('\r\n')
  }

  return [
    '#!/bin/sh',
    'case "$OPENKODO_ANTIGRAVITY_EVENT" in',
    '  Stop)',
    '    printf \'{"decision":""}\\n\'',
    '    ;;',
    '  PreToolUse)',
    '    ;;',
    '  *)',
    '    printf "{}\\n"',
    '    ;;',
    'esac',
    // Events without stdin still need a status post.
    ...buildPosixHookPayloadCapture('empty-object', POSIX_HOOK_JSON_STDIN),
    ...buildHookProcessCapture(),
    ...buildPosixHookSpoolLines('antigravity', 'OPENKODO_ANTIGRAVITY_EVENT'),
    'if [ -n "$OPENKODO_AGENT_HOOK_ENDPOINT" ] && [ -r "$OPENKODO_AGENT_HOOK_ENDPOINT" ]; then',
    '  . "$OPENKODO_AGENT_HOOK_ENDPOINT" 2>/dev/null || :',
    'fi',
    'if [ -z "$OPENKODO_AGENT_HOOK_PORT" ] || [ -z "$OPENKODO_AGENT_HOOK_TOKEN" ] || [ -z "$OPENKODO_PANE_KEY" ]; then',
    '  spool_hook_event',
    '  exit 0',
    'fi',
    // Keep large payloads off command lines to avoid EDR false positives.
    `printf '%s' "$payload" | ${posixCurlCommand()} -sS -X POST "http://127.0.0.1:\${OPENKODO_AGENT_HOOK_PORT}/hook/antigravity" \\`,
    '  --connect-timeout 0.5 --max-time 1.5 \\',
    '  -H "Content-Type: application/x-www-form-urlencoded" \\',
    '  -H "X-OpenKodo-Agent-Hook-Token: ${OPENKODO_AGENT_HOOK_TOKEN}" \\',
    '  --data-urlencode "paneKey=${OPENKODO_PANE_KEY}" \\',
    '  --data-urlencode "tabId=${OPENKODO_TAB_ID}" \\',
    '  --data-urlencode "launchToken=${OPENKODO_AGENT_LAUNCH_TOKEN}" \\',
    '  --data-urlencode "worktreeId=${OPENKODO_WORKTREE_ID}" \\',
    '  --data-urlencode "env=${OPENKODO_AGENT_HOOK_ENV}" \\',
    '  --data-urlencode "version=${OPENKODO_AGENT_HOOK_VERSION}" \\',
    '  --data-urlencode "hook_event_name=${OPENKODO_ANTIGRAVITY_EVENT}" \\',
    '  --data-urlencode "agentProcess=${orca_agent_process}" \\',
    '  --data-urlencode "tmuxPane=${orca_tmux_pane}" \\',
    '  --data-urlencode "payload@-" >/dev/null 2>&1 || spool_hook_event',
    'exit 0',
    ''
  ].join('\n')
}

export function getWindowsWrapperScript(eventName: string): string {
  return [
    '@echo off',
    // Preserve literal ! characters in the percent-expanded hooks path.
    'setlocal DisableDelayedExpansion',
    `set "OPENKODO_ANTIGRAVITY_EVENT=${eventName}"`,
    'set "OPENKODO_ANTIGRAVITY_CORE=%~dp0antigravity-hook.cmd"',
    'if exist "%OPENKODO_ANTIGRAVITY_CORE%" (',
    '  call "%OPENKODO_ANTIGRAVITY_CORE%"',
    '  exit /b 0',
    ')',
    'if /I "%OPENKODO_ANTIGRAVITY_EVENT%"=="Stop" (',
    '  echo {"decision":""}',
    ') else if /I not "%OPENKODO_ANTIGRAVITY_EVENT%"=="PreToolUse" (',
    '  echo {}',
    ')',
    ...buildWindowsHookEnvironmentGuardLines(),
    'exit /b 0',
    ''
  ].join('\r\n')
}
