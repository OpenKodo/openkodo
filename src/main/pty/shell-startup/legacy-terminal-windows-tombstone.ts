// Emitted rem lines must contain no percent signs: cmd expands them, even in comments inside blocks.
// Keep templates ASCII-only: multibyte comments broke cmd's byte-position tracking on Windows 11.

const WIN32_PASSTHROUGH_WRAPPER = String.raw`@echo off
rem Why explicit: bare setlocal inherits the caller's delayed-expansion state, and a parent shell
rem started with /V:ON made every PATH entry undergo ! expansion inside the loops below. A literal
rem !CD! entry then became the current directory and a planted git.cmd ran (exit 66), and a
rem legitimate directory whose name contains ! stopped resolving (exit 127). Both proven on
rem Windows 11; both disappear when the wrapper pins its own state.
setlocal DisableDelayedExpansion
set "openkodo_real=%OPENKODO_REAL___OPENKODO_UPPER_COMMAND__%"
set "openkodo_wrapper_dir=%~dp0"
set "openkodo_legacy_wrapper_dir=%OPENKODO_ATTRIBUTION_SHIM_DIR%"
set "openkodo_clean_path="
rem Why: holds a single separator so the trailing-separator tests below need neither a literal
rem backslash before a quote (which breaks cmd parsing) nor a sentinel character (which would
rem corrupt any path containing it). Comparisons append a dot so the separator is never
rem adjacent to a closing quote, which would break the parser exactly as a literal would.
set "openkodo_sep=\"
rem Why a subroutine, not an "if defined ... " one-liner: cmd expands a whole line before it
rem evaluates the condition, so the substring syntax below still runs against an unset variable
rem and leaves the line mangled. A CALL body is only parsed once it is reached.
rem Why here: the value cannot change mid-run, so normalize once rather than per PATH entry.
set "openkodo_legacy_norm="
if defined openkodo_legacy_wrapper_dir call :openkodo_normalize_legacy_dir
rem Why: an empty PATH leaves the substitution below with an unbalanced quote, which
rem desynchronizes cmd parsing for the rest of the file. Skip the line entirely instead.
if not defined PATH goto :openkodo_path_walked
rem Why the variable: CALL re-expands its own command line, so a PATH entry naming the current
rem directory through a percent expression would become that directory before the rooted check
rem below ever saw it, and the cwd would then be searched for __OPENKODO_COMMAND__. Proven on
rem Windows 11. The expression is spelled out only in the TypeScript comment above: cmd expands
rem percent signs inside rem, so writing one here would substitute a path into the comment.
for %%P in ("%PATH:;=" "%") do (
  set "openkodo_entry=%%~P"
  call :openkodo_append_path
)
:openkodo_path_walked
set "PATH=%openkodo_clean_path%"
set "OPENKODO_ENABLE_GIT_ATTRIBUTION="
set "OPENKODO_GIT_COMMIT_TRAILER="
set "OPENKODO_GH_PR_FOOTER="
set "OPENKODO_GH_ISSUE_FOOTER="
set "OPENKODO_ATTRIBUTION_SHIM_DIR="
set "OPENKODO_ATTRIBUTION_BYPASS="
set "OPENKODO_REAL_GIT="
set "OPENKODO_REAL_GH="
if defined openkodo_real for %%G in ("%openkodo_real%") do if /I "%%~dpG"=="%~dp0" set "openkodo_real="
rem Why: a captured path may be relative, and both "if exist" and the invocation resolve it
rem against the current directory, so an inherited .\__OPENKODO_COMMAND__.exe would run from the repo.
set "openkodo_probe=%openkodo_real%"
if defined openkodo_real call :openkodo_check_rooted
if defined openkodo_real if not defined openkodo_rooted set "openkodo_real="
rem Why: clear a captured path that no longer exists, or the PATH walk below is skipped.
if defined openkodo_real if not exist "%openkodo_real%" set "openkodo_real="
if defined openkodo_real goto run
rem Why: an unqualified Windows command lookup searches the current directory before PATH, so a
rem repository-local __OPENKODO_COMMAND__.exe would win. Walk the cleaned PATH ourselves instead.
if not defined openkodo_clean_path goto :openkodo_candidates_walked
for %%P in ("%openkodo_clean_path:;=" "%") do (
  set "openkodo_entry=%%~P"
  call :openkodo_try_candidate
)
:openkodo_candidates_walked
if not defined openkodo_real (
  echo OpenKodo compatibility wrapper could not locate __OPENKODO_COMMAND__ on PATH. 1>&2
  exit /b 127
)
:run
"%openkodo_real%" %*
exit /b %ERRORLEVEL%

:openkodo_normalize_legacy_dir
rem Why the rooted test first: full-path expansion resolves a relative value against the current
rem directory, so a
rem relative OPENKODO_ATTRIBUTION_SHIM_DIR would let the cwd decide which PATH entry counts as the
rem legacy directory and get a legitimate one skipped. Leaving the normalized value unset makes
rem the reject subroutine below a no-op, which is the safe outcome.
set "openkodo_probe=%openkodo_legacy_wrapper_dir%"
call :openkodo_check_rooted
if not defined openkodo_rooted exit /b
for %%G in ("%openkodo_legacy_wrapper_dir%") do set "openkodo_legacy_norm=%%~fG"
rem Why: full-path expansion preserves a trailing separator; normalize before comparing.
if "%openkodo_legacy_norm:~-1%."=="%openkodo_sep%." set "openkodo_legacy_norm=%openkodo_legacy_norm:~0,-1%"
exit /b

:openkodo_check_rooted
rem Why: tested in pure batch on purpose. An external tool invoked here would itself be resolved
rem from the current directory, reintroducing the very hijack this guard exists to prevent.
rem Why openkodo_probe rather than an argument: see the CALL re-expansion note above.
set "openkodo_rooted="
rem Why: an unset probe would leave the substring syntax below unexpanded and mangle the line.
if not defined openkodo_probe exit /b
if "%openkodo_probe:~0,2%"=="\\" set "openkodo_rooted=1"
if "%openkodo_probe:~1,2%"==":\" set "openkodo_rooted=1"
if "%openkodo_probe:~1,2%"==":/" set "openkodo_rooted=1"
exit /b

:openkodo_try_candidate
if defined openkodo_real exit /b
if not defined openkodo_entry exit /b
rem Why: a relative entry resolves against the current directory, same exposure as an empty one.
set "openkodo_probe=%openkodo_entry%"
call :openkodo_check_rooted
if not defined openkodo_rooted exit /b
for %%G in ("%openkodo_entry%") do set "openkodo_candidate_dir=%%~fG"
rem Why: full-path expansion preserves a trailing separator, so without normalizing, the
rem self-exclusion below misses a wrapper-dir entry spelled with one and the wrapper resolves
rem to itself, looping forever.
if "%openkodo_candidate_dir:~-1%."=="%openkodo_sep%." set "openkodo_candidate_dir=%openkodo_candidate_dir:~0,-1%"
rem Why: the script-dir operator is rebound to this label inside CALL, so compare against the
rem cached wrapper dir captured at top level.
if /I "%openkodo_candidate_dir%\"=="%openkodo_wrapper_dir%" exit /b
if exist "%openkodo_candidate_dir%\__OPENKODO_COMMAND__.exe" set "openkodo_real=%openkodo_candidate_dir%\__OPENKODO_COMMAND__.exe"
if not defined openkodo_real if exist "%openkodo_candidate_dir%\__OPENKODO_COMMAND__.cmd" set "openkodo_real=%openkodo_candidate_dir%\__OPENKODO_COMMAND__.cmd"
if not defined openkodo_real if exist "%openkodo_candidate_dir%\__OPENKODO_COMMAND__.bat" set "openkodo_real=%openkodo_candidate_dir%\__OPENKODO_COMMAND__.bat"
exit /b

:openkodo_append_path
if not defined openkodo_entry exit /b
rem Why: the exported PATH is inherited by the real git and anything it spawns, so a relative
rem entry left here lets the current directory select those tools instead.
set "openkodo_probe=%openkodo_entry%"
call :openkodo_check_rooted
if not defined openkodo_rooted exit /b
for %%G in ("%openkodo_entry%") do set "openkodo_path_entry_dir=%%~fG"
rem Why: full-path expansion preserves a trailing separator; normalize before comparing.
if "%openkodo_path_entry_dir:~-1%."=="%openkodo_sep%." set "openkodo_path_entry_dir=%openkodo_path_entry_dir:~0,-1%"
set "openkodo_path_entry_dir=%openkodo_path_entry_dir%\"
if /I "%openkodo_path_entry_dir%"=="%openkodo_wrapper_dir%" exit /b
set "openkodo_skip_entry="
if defined openkodo_legacy_wrapper_dir call :openkodo_reject_legacy_dir
if defined openkodo_skip_entry exit /b
if defined openkodo_clean_path (set "openkodo_clean_path=%openkodo_clean_path%;%openkodo_entry%") else set "openkodo_clean_path=%openkodo_entry%"
exit /b

:openkodo_reject_legacy_dir
rem Why: an unrooted legacy dir leaves this unset, and comparing against a bare separator could
rem only ever misfire.
if not defined openkodo_legacy_norm exit /b
if /I "%openkodo_path_entry_dir%"=="%openkodo_legacy_norm%\" set "openkodo_skip_entry=1"
exit /b
`

const POWERSHELL_PASSTHROUGH_WRAPPER = String.raw`$ErrorActionPreference = 'Stop'
$commandName = '__OPENKODO_COMMAND__'
$realCommand = [Environment]::GetEnvironmentVariable('OPENKODO_REAL___OPENKODO_UPPER_COMMAND__')
$wrapperDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$legacyWrapperDir = $env:OPENKODO_ATTRIBUTION_SHIM_DIR
# Why both separators: the rooted-path test below accepts forward slashes, so a directory
# spelled with a trailing / would miss this lexical exclusion and the wrapper could recurse.
$wrapperDirs = @($wrapperDir, $legacyWrapperDir) | Where-Object { $_ } | ForEach-Object { $_.TrimEnd('\', '/') }
$env:PATH = (($env:PATH -split ';') | Where-Object {
  $pathEntry = $_
  # Why: the exported PATH is inherited by the real command and anything it spawns.
  $pathEntry -and ($pathEntry -match '^([A-Za-z]:[\\/]|\\\\)') -and -not ($wrapperDirs | Where-Object {
    [string]::Equals($_, $pathEntry.TrimEnd('\', '/'), [StringComparison]::OrdinalIgnoreCase)
  })
}) -join ';'
'OPENKODO_ENABLE_GIT_ATTRIBUTION', 'OPENKODO_GIT_COMMIT_TRAILER', 'OPENKODO_GH_PR_FOOTER', 'OPENKODO_GH_ISSUE_FOOTER', 'OPENKODO_ATTRIBUTION_SHIM_DIR', 'OPENKODO_REAL_GIT', 'OPENKODO_REAL_GH', 'OPENKODO_ATTRIBUTION_BYPASS' | ForEach-Object { Remove-Item "Env:$_" -ErrorAction SilentlyContinue }
# Why: a captured value may be relative, and Test-Path plus invocation resolve it against the cwd.
if ($realCommand -and $realCommand -notmatch '^([A-Za-z]:[\\/]|\\\\)') { $realCommand = $null }
if ($realCommand) {
  try {
    $capturedDir = Split-Path -Parent ([IO.Path]::GetFullPath($realCommand))
    if ([string]::Equals($capturedDir.TrimEnd('\', '/'), $wrapperDir.TrimEnd('\', '/'), [StringComparison]::OrdinalIgnoreCase)) {
      $realCommand = $null
    }
  } catch {
    $realCommand = $null
  }
}
if (-not $realCommand -or -not (Test-Path -LiteralPath $realCommand)) {
  # Why: resolve only against the cleaned PATH directories. Ambient lookup could pick up a
  # repository-local git.exe/gh.exe from the current directory.
  $realCommand = $null
  foreach ($dir in ($env:PATH -split ';')) {
    if (-not $dir) { continue }
    # Why: a relative entry resolves against the current directory, same exposure as an empty one.
    # IsPathRooted is not enough: it accepts drive-relative 'C:foo', which resolves against the
    # current directory on that drive. IsPathFullyQualified is absent on Windows PowerShell 5.1,
    # so match the same prefixes the cmd wrapper accepts.
    if ($dir -notmatch '^([A-Za-z]:[\\/]|\\\\)') { continue }
    if ($wrapperDirs | Where-Object { [string]::Equals($_, $dir.TrimEnd('\', '/'), [StringComparison]::OrdinalIgnoreCase) }) { continue }
    foreach ($ext in @('.exe', '.cmd', '.bat')) {
      $candidate = Join-Path $dir "$commandName$ext"
      if (Test-Path -LiteralPath $candidate -PathType Leaf) { $realCommand = $candidate; break }
    }
    if ($realCommand) { break }
  }
}
if (-not $realCommand) {
  [Console]::Error.WriteLine("OpenKodo compatibility wrapper could not locate $commandName on PATH.")
  exit 127
}
& $realCommand @args
exit $LASTEXITCODE
`

function renderWindowsWrapper(template: string, command: string, upperCommand: string): string {
  return template
    .replaceAll('__OPENKODO_UPPER_COMMAND__', upperCommand)
    .replaceAll('__OPENKODO_COMMAND__', command)
}

// cmd label seeks failed in longer LF-only wrappers; emit CRLF.
function toCrlf(text: string): string {
  return text.replaceAll('\r\n', '\n').replaceAll('\n', '\r\n')
}

export function renderLegacyTerminalWindowsCmdTombstone(command: 'git' | 'gh'): string {
  return toCrlf(renderWindowsWrapper(WIN32_PASSTHROUGH_WRAPPER, command, command.toUpperCase()))
}

export function renderLegacyTerminalWindowsPowerShellTombstone(command: 'git' | 'gh'): string {
  return toCrlf(
    renderWindowsWrapper(POWERSHELL_PASSTHROUGH_WRAPPER, command, command.toUpperCase())
  )
}
