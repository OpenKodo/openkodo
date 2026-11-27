import { BASH_CWD_REPORT_BLOCK } from '../../pty/shell-startup/shell-cwd-report'
/** Bash has one --rcfile wrapper, so login startup, OSC hooks and readiness share this file. */
import { BASH_PROMPT_COMMAND_COMPOSITION_BLOCK } from '../../pty/shell-startup/bash-prompt-command-composition'
import { OPENKODO_CLI_POSIX_PATH_RESTORE } from '../../../shared/shell/launch/openkodo-cli-shell-path'
import { MANAGED_DATA_ACCOUNT_POSIX_RESTORE } from '../../../shared/shell/launch/agents/managed-data-account-shell'
import { WSL_MANAGED_CLI_PATH_RESTORE } from '../../wsl/execution/wsl-managed-cli-path-restore'
import { getPosixOmpShellWrapper } from '../../pty/shell-startup/omp-shell-wrapper'
import { getPosixCodexShellLaunchPreflight } from '../../../shared/shell/launch/agents/codex-shell-function'
import { getPosixClaudeShellFunction } from '../../../shared/shell/launch/agents/claude-shell-function'
import { getBashStartupCommandPromptBlock } from '../../pty/shell-startup/posix-shell-startup-command'
import {
  BASH_FEATURE_CHANNEL_BLOCK,
  SHELL_STARTUP_IDENTITY_MARKER_BLOCK
} from '../../pty/shell-startup/shell-templates'
import { SHELL_READY_MARKER_ESCAPED } from './local-pty-shell-ready-marker'

export function getBashShellReadyRcfileContent(): string {
  return `# OpenKodo bash shell-ready wrapper
${BASH_FEATURE_CHANNEL_BLOCK}
${SHELL_STARTUP_IDENTITY_MARKER_BLOCK}
# Consume feature selection before startup files can inherit it into children.
__openkodo_ready_marker=""
__openkodo_has_feature ready && __openkodo_ready_marker=1
unset _openkodo_shell_features
unset -f __openkodo_has_feature
[[ -f /etc/profile ]] && source /etc/profile
if [[ -f "$HOME/.bash_profile" ]]; then
  source "$HOME/.bash_profile"
elif [[ -f "$HOME/.bash_login" ]]; then
  source "$HOME/.bash_login"
elif [[ -f "$HOME/.profile" ]]; then
  source "$HOME/.profile"
fi
# Older readline needs explicit bracketed paste so multiline prompts do not submit each newline.
[[ $- == *i* ]] && bind 'set enable-bracketed-paste on' 2>/dev/null
# Login profiles may already source .bashrc; sourcing it again would duplicate PATH, hooks and prompt setup.
__openkodo_restore_agent_teams_path() {
  [[ -n "\${OPENKODO_AGENT_TEAMS_SHIM_DIR:-}" ]] || return 0
  case "$PATH" in
    "\${OPENKODO_AGENT_TEAMS_SHIM_DIR}"|"\${OPENKODO_AGENT_TEAMS_SHIM_DIR}:"*) return 0 ;;
  esac
  export PATH="\${OPENKODO_AGENT_TEAMS_SHIM_DIR}:$PATH"
}
__openkodo_restore_agent_teams_path
${OPENKODO_CLI_POSIX_PATH_RESTORE}
${WSL_MANAGED_CLI_PATH_RESTORE}
# Restore OpenKodo-managed config after user startup files may override it.
[[ -n "\${OPENKODO_OPENCODE_CONFIG_DIR:-}" ]] && export OPENCODE_CONFIG_DIR="\${OPENKODO_OPENCODE_CONFIG_DIR}"
${MANAGED_DATA_ACCOUNT_POSIX_RESTORE}
[[ -n "\${OPENKODO_MIMOCODE_CONFIG_DIR:-}" ]] && export MIMOCODE_CONFIG_DIR="\${OPENKODO_MIMOCODE_CONFIG_DIR}"
${getPosixOmpShellWrapper()}
# Profile scripts must not replace OpenKodo's runtime CODEX_HOME.
[[ -n "\${OPENKODO_CODEX_HOME:-}" ]] && export CODEX_HOME="\${OPENKODO_CODEX_HOME}"
${getPosixCodexShellLaunchPreflight() + getPosixClaudeShellFunction()}
${BASH_CWD_REPORT_BLOCK}
# OSC 133 C/D clears agent status after interrupted CLIs exit without sending Stop/SessionEnd hooks.
__openkodo_initializing_wrapper=1
__openkodo_osc133_precmd() {
  local exit_code=$?
  __openkodo_in_prompt_command=1
  __openkodo_osc133_cwd_report
  if [[ -n "\${__openkodo_in_command:-}" ]]; then
    printf "\\033]133;D;%s\\007" "$exit_code"
    unset __openkodo_in_command
  fi
  printf "\\033]133;A\\007"
  return "$exit_code"
}
__openkodo_osc133_prompt_done() {
  unset __openkodo_in_prompt_command
  __openkodo_adopt_outer_debug_trap
  trap '__openkodo_osc133_preexec' DEBUG
}
__openkodo_osc133_preexec() {
  if [[ -n "\${__openkodo_prompt_status_capture_command:-}" && "$BASH_COMMAND" == "$__openkodo_prompt_status_capture_command" ]]; then
    unset __openkodo_initial_prompt
    __openkodo_in_legacy_prompt_wrapper=1
    return 0
  fi
  if [[ -n "\${__openkodo_initializing_wrapper:-}\${__openkodo_in_debug_capture:-}\${__openkodo_initial_prompt:-}\${__openkodo_in_prompt_dispatch:-}\${__openkodo_in_legacy_prompt_wrapper:-}\${__openkodo_in_prompt_command:-}" ]]; then
    [[ -z "\${__openkodo_initializing_wrapper:-}\${__openkodo_in_debug_capture:-}" ]] || return 0
    if [[ -n "\${__openkodo_initial_prompt:-}" && "$BASH_COMMAND" == "__openkodo_osc133_precmd" ]]; then
      unset __openkodo_initial_prompt; return 0
    fi
    if [[ -n "\${__openkodo_in_prompt_dispatch:-}" ]]; then
      [[ -n "\${__openkodo_dispatching_user_prompt_command:-}" ]] || return 0
      if [[ "\${FUNCNAME[1]:-}" == "__openkodo_run_prompt_command_array" ]]; then
        case "$BASH_COMMAND" in
          '(( __openkodo_exit_code == 0 ))'|'__openkodo_restore_prompt_status "$__openkodo_exit_code"'|'eval "$__openkodo_prompt_part"'|'eval "$__openkodo_final_prompt_command"'|__openkodo_dispatching_user_prompt_command=*|__openkodo_osc133_precmd|__openkodo_osc133_prompt_done|__openkodo_prompt_mark) return 0 ;;
        esac
      fi
    elif [[ "\${FUNCNAME[1]:-}" == "__openkodo_run_prompt_command_array" || "$BASH_COMMAND" == "__openkodo_run_prompt_command_array" ]]; then
      return 0
    fi
    [[ -z "\${__openkodo_in_legacy_prompt_wrapper:-}" || -n "\${__openkodo_dispatching_user_prompt_command:-}" ]] || return 0
    if [[ -n "\${__openkodo_in_prompt_command:-}" && "$BASH_COMMAND" == "__openkodo_in_debug_capture=1" ]]; then
      return 0
    fi
  fi
  case "\${FUNCNAME[1]:-}" in __openkodo_osc133_*|__openkodo_prompt_mark|__openkodo_restore_prompt_status) return 0 ;; esac
  case "$BASH_COMMAND" in __openkodo_osc133_precmd|__openkodo_osc133_prompt_done|__openkodo_prompt_mark) return 0 ;; esac
  __openkodo_run_user_debug_trap
  [[ -z "\${__openkodo_in_prompt_command:-}" ]] || return 0
  [[ -z "\${__openkodo_in_command:-}" ]] || return 0
  # DEBUG runs per simple command; chained traps may reenter for the same foreground command.
  printf "\\033]133;C\\007"
  __openkodo_in_command=1
}
# Capture $? before the user's PROMPT_COMMAND chain mutates it.
${BASH_PROMPT_COMMAND_COMPOSITION_BLOCK}
__openkodo_prepend_prompt_command "__openkodo_osc133_precmd"
# Mark readiness after user prompt setup without rerunning startup files.
if [[ -n "$__openkodo_ready_marker" ]]; then
  __openkodo_prompt_mark() {
    printf "${SHELL_READY_MARKER_ESCAPED}"
  }
  __openkodo_append_prompt_command "__openkodo_prompt_mark"
fi
__openkodo_append_prompt_command '__openkodo_in_debug_capture=1; __openkodo_prompt_had_functrace=""; if [[ -o functrace ]]; then __openkodo_prompt_had_functrace=1; set +T; fi; __openkodo_outer_debug_trap_spec="$(trap -p DEBUG)"; [[ -z "$__openkodo_prompt_had_functrace" ]] || set -T; unset __openkodo_prompt_had_functrace __openkodo_in_debug_capture'
__openkodo_append_prompt_command "__openkodo_osc133_prompt_done"
${getBashStartupCommandPromptBlock()}
__openkodo_had_functrace=""
[[ -o functrace ]] && __openkodo_had_functrace=1
set +T
__openkodo_debug_trap_spec="$(trap -p DEBUG)"
[[ -z "$__openkodo_had_functrace" ]] || set -T
if [[ -n "$__openkodo_debug_trap_spec" && "$__openkodo_debug_trap_spec" != "trap -- '__openkodo_osc133_preexec' DEBUG" ]]; then
  __openkodo_debug_trap_command="\${__openkodo_debug_trap_spec#trap -- }"
  __openkodo_debug_trap_command="\${__openkodo_debug_trap_command% DEBUG}"
  eval "__openkodo_user_debug_trap=$__openkodo_debug_trap_command"
fi
unset __openkodo_debug_trap_spec __openkodo_debug_trap_command __openkodo_had_functrace
unset -f __openkodo_normalize_prompt_command_part __openkodo_normalize_prompt_command __openkodo_prepend_prompt_command __openkodo_append_prompt_command
unset __openkodo_prompt_command_normalized
# Arm DEBUG after wrapper setup to avoid fake foreground C/D events before the first prompt.
__openkodo_initial_prompt=1
trap '__openkodo_osc133_preexec' DEBUG
unset __openkodo_initializing_wrapper
`
}
