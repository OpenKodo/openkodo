import { basename, win32 as pathWin32 } from 'node:path'

export const POSIX_SHELL_STARTUP_COMMAND_ENV = 'OPENKODO_POSIX_SHELL_STARTUP_COMMAND'

export function supportsPosixShellStartupCommand(shellPath: string): boolean {
  const shellName = pathWin32.basename(basename(shellPath)).toLowerCase()
  return shellName === 'bash' || shellName === 'zsh' || shellName === 'fish'
}

export function getBashStartupCommandPromptBlock(): string {
  return `if [[ \${${POSIX_SHELL_STARTUP_COMMAND_ENV}+present} == present ]]; then
  __openkodo_remove_startup_command_prompt_hook() {
    local __openkodo_item
    local -a __openkodo_remaining=()
    if (( BASH_VERSINFO[0] > 5 || (BASH_VERSINFO[0] == 5 && BASH_VERSINFO[1] >= 1) )); then
      for __openkodo_item in "\${PROMPT_COMMAND[@]+"\${PROMPT_COMMAND[@]}"}"; do
        [[ "$__openkodo_item" == "__openkodo_run_startup_command" ]] || __openkodo_remaining+=("$__openkodo_item")
      done
      PROMPT_COMMAND=("\${__openkodo_remaining[@]+"\${__openkodo_remaining[@]}"}")
    else
      for __openkodo_item in "\${__openkodo_prompt_command_suffix[@]+"\${__openkodo_prompt_command_suffix[@]}"}"; do
        [[ "$__openkodo_item" == "__openkodo_run_startup_command" ]] || __openkodo_remaining+=("$__openkodo_item")
      done
      __openkodo_prompt_command_suffix=("\${__openkodo_remaining[@]+"\${__openkodo_remaining[@]}"}")
    fi
  }
  __openkodo_run_startup_command() {
    local __openkodo_command="$${POSIX_SHELL_STARTUP_COMMAND_ENV}" __openkodo_status
    unset ${POSIX_SHELL_STARTUP_COMMAND_ENV}
    __openkodo_remove_startup_command_prompt_hook
    unset -f __openkodo_remove_startup_command_prompt_hook
    builtin history -s "$__openkodo_command" 2>/dev/null || true
    builtin printf '%s\n' "$__openkodo_command"
    eval "$__openkodo_command"
    __openkodo_status=$?
    unset -f __openkodo_run_startup_command
    return "$__openkodo_status"
  }
  __openkodo_append_prompt_command "__openkodo_run_startup_command"
fi`
}
