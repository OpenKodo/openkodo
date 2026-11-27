import {
  OPENKODO_IMAGE_PROTOCOL_ENV,
  OPENKODO_IMAGE_PROTOCOL_VALUE
} from '../../../terminal/images/terminal-image-protocol'

/** Re-read account selection on every launch in OpenKodo-routed panes with a real claude binary. Missing/empty pointer restores the user’s config; another pane override wins. Create account homes without a login silently and preserve Anthropic auth. Refuse nonabsolute pointers rather than run under the wrong account. */
export function getPosixClaudeShellFunction(): string {
  return `__openkodo_claude_binary="$(unalias claude 2>/dev/null || :; command -v claude 2>/dev/null || :)"
# Why typeset -f: a user's own claude function wins; command -v prints its bare name, which -x tests against the cwd.
if ! typeset -f claude >/dev/null 2>&1 && [[ -n "\${__openkodo_claude_binary:-}" && -x "\${__openkodo_claude_binary}" ]] &&
   [[ -n "\${OPENKODO_CLAUDE_PROFILE_POINTER:-}" || "\${${OPENKODO_IMAGE_PROTOCOL_ENV}:-}" == '${OPENKODO_IMAGE_PROTOCOL_VALUE}' ]]; then
  function claude {
    local __openkodo_claude_home __openkodo_claude_pointer="\${OPENKODO_CLAUDE_PROFILE_POINTER:-}"
    if [[ "\${${OPENKODO_IMAGE_PROTOCOL_ENV}:-}" == '${OPENKODO_IMAGE_PROTOCOL_VALUE}' && -z "\${CLAUDE_CODE_FORCE_TERMINAL_IMAGES+x}" ]]; then
      local -x CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1
    fi
    if [ -z "$__openkodo_claude_pointer" ]; then
      command claude "$@"; return
    fi
    # Why: a WSL pane's pointer is relative to the guest home, which the host cannot know at spawn.
    case "$__openkodo_claude_pointer" in '~/'*) __openkodo_claude_pointer="\${HOME:-}/\${__openkodo_claude_pointer#??}" ;; esac
    __openkodo_claude_home="$(cat "$__openkodo_claude_pointer" 2>/dev/null || :)"
    if [ -n "\${CLAUDE_CONFIG_DIR:-}" ] && [ "$CLAUDE_CONFIG_DIR" != "\${OPENKODO_CLAUDE_INJECTED_CONFIG_DIR:-}" ] &&
      { [ -z "\${OPENKODO_CLAUDE_USER_CONFIG_DIR:-}" ] || [ "\${CLAUDE_CONFIG_DIR%/}" != "\${OPENKODO_CLAUDE_USER_CONFIG_DIR%/}" ]; }; then
      command claude "$@"; return
    fi
    # Why exec: bash can keep the subshell leading Claude's foreground group; zsh exec runs functions, hence unset -f.
    # Why: OpenKodo's value replaced the user's own at spawn, so System default restores theirs.
    if [ -z "$__openkodo_claude_home" ] && [ -n "\${CLAUDE_CONFIG_DIR:-}" ] && [ -n "\${OPENKODO_CLAUDE_USER_CONFIG_DIR:-}" ]; then
      ( unset OPENKODO_CLAUDE_INJECTED_CONFIG_DIR; export CLAUDE_CONFIG_DIR="$OPENKODO_CLAUDE_USER_CONFIG_DIR"; unset -f claude; exec claude "$@" ); return
    fi
    if [ -z "$__openkodo_claude_home" ]; then
      ( unset CLAUDE_CONFIG_DIR OPENKODO_CLAUDE_INJECTED_CONFIG_DIR; unset -f claude; exec claude "$@" ); return
    fi
    case "$__openkodo_claude_home" in /*|[A-Za-z]:*) ;; *) return 1 ;; esac
    # Why -m 700: matches the folder OpenKodo's setup creates; a credentials folder stays private.
    [ -d "$__openkodo_claude_home" ] || mkdir -p -m 700 -- "$__openkodo_claude_home" 2>/dev/null
    ( export CLAUDE_CONFIG_DIR="$__openkodo_claude_home" OPENKODO_CLAUDE_INJECTED_CONFIG_DIR="$__openkodo_claude_home"; unset -f claude; exec claude "$@" )
  }
fi
unset __openkodo_claude_binary
`
}

/** Leading newline separates the preceding codex fragment, which has no trailing newline. */
export function getFishClaudeShellFunction(): string {
  return `
set -l __openkodo_claude_type (type -t claude 2>/dev/null)
if test "$__openkodo_claude_type" = file; and begin; test -n "$OPENKODO_CLAUDE_PROFILE_POINTER"; or test "$${OPENKODO_IMAGE_PROTOCOL_ENV}" = '${OPENKODO_IMAGE_PROTOCOL_VALUE}'; end
  function claude
    test "$${OPENKODO_IMAGE_PROTOCOL_ENV}" = '${OPENKODO_IMAGE_PROTOCOL_VALUE}'; and not set -q CLAUDE_CODE_FORCE_TERMINAL_IMAGES; and set -lx CLAUDE_CODE_FORCE_TERMINAL_IMAGES 1
    if test -z "$OPENKODO_CLAUDE_PROFILE_POINTER"
      command claude $argv
      return $status
    end
    # Why: a WSL pane's pointer is relative to the guest home, which the host cannot know at spawn.
    set -l pointer (string replace -r '^~/' "$HOME/" -- "$OPENKODO_CLAUDE_PROFILE_POINTER")
    set -l profile (cat "$pointer" 2>/dev/null)
    set -l own (string trim -r -c / -- "$OPENKODO_CLAUDE_USER_CONFIG_DIR")
    set -l current (string trim -r -c / -- "$CLAUDE_CONFIG_DIR")
    if test -n "$CLAUDE_CONFIG_DIR"; and test "$CLAUDE_CONFIG_DIR" != "$OPENKODO_CLAUDE_INJECTED_CONFIG_DIR"; and begin; test -z "$own"; or test "$current" != "$own"; end
      command claude $argv
      return $status
    end
    if test -z "$profile"; and test -n "$CLAUDE_CONFIG_DIR"; and test -n "$OPENKODO_CLAUDE_USER_CONFIG_DIR"
      env -u OPENKODO_CLAUDE_INJECTED_CONFIG_DIR CLAUDE_CONFIG_DIR="$OPENKODO_CLAUDE_USER_CONFIG_DIR" claude $argv
      return $status
    end
    if test -z "$profile"
      env -u CLAUDE_CONFIG_DIR -u OPENKODO_CLAUDE_INJECTED_CONFIG_DIR claude $argv
      return $status
    end
    if not string match -qr '^(/|[A-Za-z]:)' -- "$profile"
      return 1
    end
    test -d "$profile"; or mkdir -p -m 700 -- "$profile" 2>/dev/null
    env CLAUDE_CONFIG_DIR="$profile" OPENKODO_CLAUDE_INJECTED_CONFIG_DIR="$profile" claude $argv
  end
end
set -e __openkodo_claude_type
`
}

export function getPowerShellClaudeShellFunction(): string {
  return `$openkodoClaudeCommand = Get-Command claude -ErrorAction SilentlyContinue | Select-Object -First 1
if (($env:OPENKODO_CLAUDE_PROFILE_POINTER -or $env:${OPENKODO_IMAGE_PROTOCOL_ENV} -ceq '${OPENKODO_IMAGE_PROTOCOL_VALUE}') -and $openkodoClaudeCommand -and
    $openkodoClaudeCommand.CommandType -in @("Application", "ExternalScript")) {
function Global:claude {
    $names = @('CLAUDE_CONFIG_DIR', 'OPENKODO_CLAUDE_INJECTED_CONFIG_DIR', 'CLAUDE_CODE_FORCE_TERMINAL_IMAGES')
    $saved = @{}
    foreach ($name in $names) { $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
    try {
        if ($env:${OPENKODO_IMAGE_PROTOCOL_ENV} -ceq '${OPENKODO_IMAGE_PROTOCOL_VALUE}' -and -not (Test-Path Env:CLAUDE_CODE_FORCE_TERMINAL_IMAGES)) {
            $env:CLAUDE_CODE_FORCE_TERMINAL_IMAGES = '1'
        }
        $openkodoClaudeHome = ''
        if ($env:OPENKODO_CLAUDE_PROFILE_POINTER -and (Test-Path -LiteralPath $env:OPENKODO_CLAUDE_PROFILE_POINTER -PathType Leaf)) {
            $openkodoClaudeHome = [IO.File]::ReadAllText($env:OPENKODO_CLAUDE_PROFILE_POINTER).TrimEnd()
        }
        # Why the separator swap: Windows names one folder with either separator.
        $own = ("$env:OPENKODO_CLAUDE_USER_CONFIG_DIR" -replace '/', '\\').TrimEnd('\\')
        if (-not $env:OPENKODO_CLAUDE_PROFILE_POINTER -or (
            $env:CLAUDE_CONFIG_DIR -and $env:CLAUDE_CONFIG_DIR -ne $env:OPENKODO_CLAUDE_INJECTED_CONFIG_DIR -and
            (-not $own -or ("$env:CLAUDE_CONFIG_DIR" -replace '/', '\\').TrimEnd('\\') -ne $own))) {
            # A value set in this pane, other than the user's own, wins.
        } elseif (-not $openkodoClaudeHome) {
            Remove-Item Env:OPENKODO_CLAUDE_INJECTED_CONFIG_DIR -ErrorAction SilentlyContinue
            if ($env:CLAUDE_CONFIG_DIR -and $env:OPENKODO_CLAUDE_USER_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR = $env:OPENKODO_CLAUDE_USER_CONFIG_DIR }
            else { Remove-Item Env:CLAUDE_CONFIG_DIR -ErrorAction SilentlyContinue }
        } elseif (-not [IO.Path]::IsPathRooted($openkodoClaudeHome)) {
            $global:LASTEXITCODE = 1
            return
        } else {
            if (-not [IO.Directory]::Exists($openkodoClaudeHome)) { $null = New-Item -ItemType Directory -Path $openkodoClaudeHome -Force -ErrorAction SilentlyContinue }
            $env:CLAUDE_CONFIG_DIR = $openkodoClaudeHome
            $env:OPENKODO_CLAUDE_INJECTED_CONFIG_DIR = $openkodoClaudeHome
        }
        $binary = Get-Command claude -CommandType Application,ExternalScript -ErrorAction Stop | Select-Object -First 1
        $claudeArgs = @(__OpenKodoEscapeNativeArgs $binary.Source $args)
        if ($MyInvocation.ExpectingInput) { $input | & $binary.Source @claudeArgs } else { & $binary.Source @claudeArgs }
        $global:LASTEXITCODE = $LASTEXITCODE
    } catch { $global:LASTEXITCODE = 1; Write-Error $_ -ErrorAction Continue }
    finally {
        # Why Remove-Item: on .NET 9+ a $null value (passed as "") creates the variable empty instead of deleting it.
        foreach ($name in $names) {
            if ($null -eq $saved[$name]) { Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue }
            else { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
        }
    }
}
}
Remove-Variable openkodoClaudeCommand -ErrorAction SilentlyContinue
`
}
