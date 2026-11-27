// Typed OMP needs OpenKodo's status extension explicitly; preserve PI_CODING_AGENT_DIR as the user's mutable auth/config/session home.

const OMP_SUBCOMMANDS = [
  '__complete',
  'acp',
  'agents',
  'auth-broker',
  'auth-gateway',
  'bench',
  'commit',
  'completions',
  'config',
  'dry-balance',
  'gallery',
  'grep',
  'grievances',
  'install',
  'join',
  'models',
  'plugin',
  'read',
  'say',
  'search',
  'setup',
  'shell',
  'ssh',
  'stats',
  'tiny-models',
  'token',
  'ttsr',
  'update',
  'usage',
  'worktree',
  'q',
  'wt'
] as const

export function getPosixOmpShellWrapper(): string {
  const subcommands = OMP_SUBCOMMANDS.map((value) => `'${value}'`).join('|')
  return `# Why: OMP does not auto-load OpenKodo's managed status extension; wrap only
# interactive launch invocations so subcommands such as \`omp config\` keep
# their normal argv shape.
__openkodo_omp_should_skip_extension() {
  case "\${1:-}" in
    'help'|'--help'|'-h'|'--version'|'-v') return 0 ;;
    ${subcommands}) return 0 ;;
  esac
  return 1
}
__openkodo_omp_cwd_is_usable() {
  local __openkodo_physical_cwd
  [[ -x . ]] || return 1
  if [[ -n "\${PWD:-}" && -d "\${PWD:-}" ]]; then
    [[ "\${PWD}" -ef . ]]
  else
    # Why compare the path: shell builtins can print a cached path for a deleted cwd.
    __openkodo_physical_cwd="$(builtin pwd -P 2>/dev/null)" || return 1
    [[ -d "$__openkodo_physical_cwd" && "$__openkodo_physical_cwd" -ef . ]]
  fi
}
__openkodo_omp_invoke() {
  local __openkodo_use_extension="$1"
  shift
  if [[ $__openkodo_use_extension -eq 1 && -n "\${OPENKODO_OMP_STATUS_EXTENSION:-}" && -f "\${OPENKODO_OMP_STATUS_EXTENSION}" ]]; then
    if [[ "\${1:-}" == "launch" ]]; then
      shift
      command omp launch --extension "\${OPENKODO_OMP_STATUS_EXTENSION}" "$@"
    else
      command omp --extension "\${OPENKODO_OMP_STATUS_EXTENSION}" "$@"
    fi
  else
    command omp "$@"
  fi
}
__openkodo_omp() {
  local __openkodo_use_extension=1
  __openkodo_omp_should_skip_extension "\${1:-}" && __openkodo_use_extension=0
  if ! __openkodo_omp_cwd_is_usable; then
    local __openkodo_logical_cwd="\${PWD:-\${OPENKODO_WORKTREE_PATH:-\${OPENKODO_ROOT_PATH:-}}}"
    # Why: a restored shell can retain the deleted directory inode after its path is recreated.
    (
      if [[ -z "$__openkodo_logical_cwd" ]]; then
        printf 'OpenKodo: OMP cannot start because no terminal working directory is available. Open a new terminal in an existing directory.\\n' >&2
        return 1
      fi
      if ! builtin cd -P -- "$__openkodo_logical_cwd" 2>/dev/null; then
        printf 'OpenKodo: OMP cannot access the terminal working directory "%s". Open a new terminal in an existing directory.\\n' "$__openkodo_logical_cwd" >&2
        return 1
      fi
      __openkodo_omp_invoke "$__openkodo_use_extension" "$@"
    )
  else
    __openkodo_omp_invoke "$__openkodo_use_extension" "$@"
  fi
}
if [[ -n "\${OPENKODO_OMP_STATUS_EXTENSION:-}" ]]; then
  # Why the function reserved word: it suppresses alias expansion of the name, which
  # an \`alias omp\` otherwise rewrites at parse time, aborting the rest of the file.
  function omp { __openkodo_omp "$@"; }
fi
`
}

export function getPowerShellOmpShellWrapper(): string {
  const subcommands = OMP_SUBCOMMANDS.map((value) => `'${value}'`).join(', ')
  return `# Why: OMP does not auto-load OpenKodo's managed status extension; wrap only
# interactive launch invocations so subcommands such as \`omp config\` keep
# their normal argv shape.
function Global:__OpenKodoOmpShouldSkipExtension {
    param([string]$Name)
    $skip = @("help", "--help", "-h", "--version", "-v") + @(${subcommands})
    return $skip -contains $Name
}
if ($env:OPENKODO_OMP_STATUS_EXTENSION) {
    function Global:omp {
        $openkodoUseExtension = -not (__OpenKodoOmpShouldSkipExtension -Name ([string]($args[0])))
        $openkodoStatus = 0
        $openkodoCommand = Get-Command omp -CommandType Application,ExternalScript -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $openkodoCommand) {
            Write-Error "omp executable not found"
            $openkodoStatus = 127
        } elseif ($openkodoUseExtension -and $env:OPENKODO_OMP_STATUS_EXTENSION -and
            (Test-Path -LiteralPath $env:OPENKODO_OMP_STATUS_EXTENSION)) {
            if ($args.Count -gt 0 -and $args[0] -eq "launch") {
                $openkodoLaunchArgs = @($args | Select-Object -Skip 1)
                & $openkodoCommand.Source launch --extension $env:OPENKODO_OMP_STATUS_EXTENSION @openkodoLaunchArgs
            } else {
                & $openkodoCommand.Source --extension $env:OPENKODO_OMP_STATUS_EXTENSION @args
            }
            $openkodoStatus = $LASTEXITCODE
        } else {
            & $openkodoCommand.Source @args
            $openkodoStatus = $LASTEXITCODE
        }

        $global:LASTEXITCODE = $openkodoStatus
    }
}
`
}
