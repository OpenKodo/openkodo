export const BASH_PROMPT_COMMAND_COMPOSITION_BLOCK = `__openkodo_normalize_prompt_command_part() {
  local __openkodo_value="$1" __openkodo_output_name="$2" __openkodo_character __openkodo_chunk
  local __openkodo_value_length=\${#1} __openkodo_suffix_length=0 __openkodo_backslash_length=0
  local __openkodo_output_length __openkodo_scan_start
  while (( __openkodo_value_length - __openkodo_suffix_length >= 1024 )); do
    __openkodo_scan_start=$(( __openkodo_value_length - __openkodo_suffix_length - 1024 ))
    __openkodo_chunk="\${__openkodo_value:__openkodo_scan_start:1024}"
    case "$__openkodo_chunk" in
      *[!$' \\t\\n;']*) break ;;
      *) __openkodo_suffix_length=$(( __openkodo_suffix_length + 1024 )) ;;
    esac
  done
  while (( __openkodo_suffix_length < __openkodo_value_length )); do
    __openkodo_character="\${__openkodo_value: -__openkodo_suffix_length - 1:1}"
    case "$__openkodo_character" in
      ' '|$'\\t'|$'\\n'|';') __openkodo_suffix_length=$(( __openkodo_suffix_length + 1 )) ;;
      *) break ;;
    esac
  done
  __openkodo_output_length=$(( \${#__openkodo_value} - __openkodo_suffix_length ))
  while (( __openkodo_output_length - __openkodo_backslash_length >= 1024 )); do
    __openkodo_scan_start=$(( __openkodo_output_length - __openkodo_backslash_length - 1024 ))
    __openkodo_chunk="\${__openkodo_value:__openkodo_scan_start:1024}"
    case "$__openkodo_chunk" in
      *[!\\\\]*) break ;;
      *) __openkodo_backslash_length=$(( __openkodo_backslash_length + 1024 )) ;;
    esac
  done
  while (( __openkodo_backslash_length < __openkodo_output_length )); do
    __openkodo_character="\${__openkodo_value:__openkodo_output_length - __openkodo_backslash_length - 1:1}"
    [[ "$__openkodo_character" == '\\' ]] || break
    __openkodo_backslash_length=$(( __openkodo_backslash_length + 1 ))
  done
  # Preserve the first separator when an odd backslash run escapes it.
  if (( __openkodo_suffix_length > 0 && __openkodo_backslash_length % 2 == 1 )); then
    __openkodo_suffix_length=$(( __openkodo_suffix_length - 1 ))
    __openkodo_backslash_length=0
  fi
  __openkodo_output_length=$(( \${#__openkodo_value} - __openkodo_suffix_length ))
  __openkodo_value="\${__openkodo_value:0:__openkodo_output_length}"
  # Bash 4.4-5.0 scalar prompt evaluation preserves an odd terminal backslash.
  if (( __openkodo_suffix_length == 0 && ((BASH_VERSINFO[0] == 4 && BASH_VERSINFO[1] >= 4) || (BASH_VERSINFO[0] == 5 && BASH_VERSINFO[1] == 0)) && __openkodo_backslash_length % 2 == 1 )); then
    __openkodo_value="$__openkodo_value\\\\"
  fi
  printf -v "$__openkodo_output_name" '%s' "$__openkodo_value"
}
__openkodo_restore_prompt_status() {
  return "$1"
}
__openkodo_update_user_debug_trap() {
  local __openkodo_debug_trap_spec="$1" __openkodo_unchanged_debug_trap_spec="$2"
  local __openkodo_debug_trap_command
  [[ "$__openkodo_debug_trap_spec" != "$__openkodo_unchanged_debug_trap_spec" ]] || return 0
  [[ "$__openkodo_debug_trap_spec" != "trap -- '__openkodo_osc133_preexec' DEBUG" ]] || return 0
  if [[ -z "$__openkodo_debug_trap_spec" ]]; then
    __openkodo_user_debug_trap=""
    unset __openkodo_chained_debug_trap
    return 0
  fi
  __openkodo_debug_trap_command="\${__openkodo_debug_trap_spec#trap -- }"
  __openkodo_debug_trap_command="\${__openkodo_debug_trap_command% DEBUG}"
  eval "__openkodo_user_debug_trap=$__openkodo_debug_trap_command"
  unset __openkodo_chained_debug_trap
}
__openkodo_run_user_debug_trap() {
  if [[ -n "\${__openkodo_user_debug_trap:-}" ]]; then
    eval "$__openkodo_user_debug_trap" || true
  fi
}
__openkodo_adopt_outer_debug_trap() {
  local __openkodo_debug_trap_spec="\${__openkodo_outer_debug_trap_spec:-}"
  unset __openkodo_outer_debug_trap_spec
  __openkodo_update_user_debug_trap "$__openkodo_debug_trap_spec" "trap -- '__openkodo_osc133_preexec' DEBUG"
}
__openkodo_run_prompt_command_array() {
  local __openkodo_exit_code="\${__openkodo_prompt_status:-$?}" __openkodo_prompt_part __openkodo_prompt_index __openkodo_user_count
  local __openkodo_suffix_part
  local __openkodo_final_prompt_command
  local __openkodo_in_prompt_dispatch=1 __openkodo_dispatching_user_prompt_command=""
  unset __openkodo_prompt_status
  __openkodo_adopt_outer_debug_trap
  trap '__openkodo_osc133_preexec' DEBUG
  for __openkodo_prompt_part in "\${__openkodo_prompt_command_prefix[@]+"\${__openkodo_prompt_command_prefix[@]}"}"; do
    if (( __openkodo_exit_code == 0 )); then
      eval "$__openkodo_prompt_part"
    else
      __openkodo_restore_prompt_status "$__openkodo_exit_code" || eval "$__openkodo_prompt_part"
    fi
  done
  __openkodo_user_count=0
  for __openkodo_prompt_part in "\${__openkodo_prompt_command_array[@]+"\${__openkodo_prompt_command_array[@]}"}"; do
    __openkodo_user_count=$(( __openkodo_user_count + 1 ))
  done
  for (( __openkodo_prompt_index = 0; __openkodo_prompt_index + 1 < __openkodo_user_count; __openkodo_prompt_index++ )); do
    __openkodo_prompt_part="\${__openkodo_prompt_command_array[__openkodo_prompt_index]}"
    __openkodo_dispatching_user_prompt_command=1
    if (( __openkodo_exit_code == 0 )); then
      eval "$__openkodo_prompt_part"
    else
      __openkodo_restore_prompt_status "$__openkodo_exit_code" || eval "$__openkodo_prompt_part"
    fi
    __openkodo_dispatching_user_prompt_command=""
  done
  if (( __openkodo_user_count > 0 )); then
    __openkodo_prompt_part="\${__openkodo_prompt_command_array[__openkodo_user_count - 1]}"
    # Why: keep the final user hook and OpenKodo suffixes in one status-preserving eval.
    __openkodo_final_prompt_command='eval "$__openkodo_prompt_part"'
    for __openkodo_suffix_part in "\${__openkodo_prompt_command_suffix[@]+"\${__openkodo_prompt_command_suffix[@]}"}"; do
      __openkodo_final_prompt_command+=$'\\n'"$__openkodo_suffix_part"
    done
    __openkodo_dispatching_user_prompt_command=1
    if (( __openkodo_exit_code == 0 )); then
      eval "$__openkodo_final_prompt_command"
    else
      __openkodo_restore_prompt_status "$__openkodo_exit_code" || eval "$__openkodo_final_prompt_command"
    fi
    __openkodo_dispatching_user_prompt_command=""
  else
    for __openkodo_prompt_part in "\${__openkodo_prompt_command_suffix[@]+"\${__openkodo_prompt_command_suffix[@]}"}"; do
      if (( __openkodo_exit_code == 0 )); then
        eval "$__openkodo_prompt_part"
      else
        __openkodo_restore_prompt_status "$__openkodo_exit_code" || eval "$__openkodo_prompt_part"
      fi
    done
  fi
  return "$__openkodo_exit_code"
}
__openkodo_finish_legacy_prompt_dispatch() {
  local __openkodo_suffix_part
  if [[ -n "\${__openkodo_in_prompt_command:-}" ]]; then
    for __openkodo_suffix_part in "\${__openkodo_prompt_command_suffix[@]+"\${__openkodo_prompt_command_suffix[@]}"}"; do
      eval "$__openkodo_suffix_part"
    done
  fi
}
__openkodo_normalize_prompt_command() {
  [[ -z "\${__openkodo_prompt_command_normalized:-}" ]] || return 0
  local __openkodo_prompt_part
  local -a __openkodo_normalized=()
  for __openkodo_prompt_part in "\${PROMPT_COMMAND[@]+"\${PROMPT_COMMAND[@]}"}"; do
    __openkodo_normalize_prompt_command_part "$__openkodo_prompt_part" __openkodo_prompt_part
    [[ -n "$__openkodo_prompt_part" ]] && __openkodo_normalized+=("$__openkodo_prompt_part")
  done
  __openkodo_prompt_command_normalized=1
  if (( BASH_VERSINFO[0] > 5 || (BASH_VERSINFO[0] == 5 && BASH_VERSINFO[1] >= 1) )); then
    PROMPT_COMMAND=("\${__openkodo_normalized[@]+"\${__openkodo_normalized[@]}"}")
  else
    __openkodo_prompt_command_array=("\${__openkodo_normalized[@]+"\${__openkodo_normalized[@]}"}")
    __openkodo_prompt_command_prefix=()
    __openkodo_prompt_command_suffix=()
    unset PROMPT_COMMAND
    # Why: PID scope distinguishes legacy prompt dispatch from ordinary user command text.
    __openkodo_prompt_status_variable="__openkodo_prompt_status_$$"
    __openkodo_prompt_status_capture_command="$__openkodo_prompt_status_variable=\\$?"
    __openkodo_prompt_status_value="\\\${$__openkodo_prompt_status_variable}"
    # Why: a changed DEBUG trap misses the capture command, and bash <= 4.3 reverts traps set in functions.
    PROMPT_COMMAND="$__openkodo_prompt_status_capture_command; __openkodo_in_legacy_prompt_wrapper=1; __openkodo_prompt_status=$__openkodo_prompt_status_value"'; __openkodo_prompt_had_functrace=""; if [[ -o functrace ]]; then __openkodo_prompt_had_functrace=1; set +T; fi; __openkodo_outer_debug_trap_spec="$(trap -p DEBUG)"; [[ -z "$__openkodo_prompt_had_functrace" ]] || set -T; unset __openkodo_prompt_had_functrace; __openkodo_run_prompt_command_array; __openkodo_finish_legacy_prompt_dispatch; trap __openkodo_osc133_preexec DEBUG; unset __openkodo_in_legacy_prompt_wrapper'
  fi
}
__openkodo_prepend_prompt_command() {
  local command="$1"
  __openkodo_normalize_prompt_command
  if (( BASH_VERSINFO[0] > 5 || (BASH_VERSINFO[0] == 5 && BASH_VERSINFO[1] >= 1) )); then
    PROMPT_COMMAND=("$command" "\${PROMPT_COMMAND[@]+"\${PROMPT_COMMAND[@]}"}")
  else
    __openkodo_prompt_command_prefix=("$command" "\${__openkodo_prompt_command_prefix[@]+"\${__openkodo_prompt_command_prefix[@]}"}")
  fi
}
__openkodo_append_prompt_command() {
  local command="$1"
  __openkodo_normalize_prompt_command
  if (( BASH_VERSINFO[0] > 5 || (BASH_VERSINFO[0] == 5 && BASH_VERSINFO[1] >= 1) )); then
    PROMPT_COMMAND+=("$command")
  else
    __openkodo_prompt_command_suffix+=("$command")
  fi
}`
