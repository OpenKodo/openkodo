/** Capture before OpenKodo inserts its managed-script shell. */
export const HOOK_PARENT_CAPTURE =
  'OPENKODO_HOOK_AGENT_PID="${PPID:-}"; export OPENKODO_HOOK_AGENT_PID; '

// Uncached, as no builtin tells a reused PID from its old process: Linux reads /proc, macOS runs only ps.
export function buildHookProcessCapture(): string[] {
  return [
    'openkodo_agent_process= openkodo_agent_pid="${OPENKODO_HOOK_AGENT_PID:-}"',
    // Field 2 after the command name is ppid; field 20 is the start time in clock ticks since boot.
    'openkodo_agent_stat_fields() { openkodo_agent_ppid=${2-}; openkodo_agent_start=${20-}; }',
    '[ -z "${OPENKODO_PANE_KEY:-}" ] || case "$openkodo_agent_pid" in ""|*[!0-9]*) ;; *)',
    '  if [ -r "/proc/$openkodo_agent_pid/stat" ]; then',
    '    openkodo_agent_stat= openkodo_agent_line= openkodo_agent_boot= openkodo_agent_start= openkodo_agent_ppid= openkodo_agent_cmdline=',
    // Read to EOF: a command name may contain a newline, and the strip below takes the last ") ".
    '    while IFS= read -r openkodo_agent_line || [ -n "$openkodo_agent_line" ]; do openkodo_agent_stat="$openkodo_agent_stat$openkodo_agent_line "; openkodo_agent_line=; done 2>/dev/null < "/proc/$openkodo_agent_pid/stat"',
    '    openkodo_agent_stat_fields ${openkodo_agent_stat##*) }',
    // agy runs hooks via `sh -c`; a shell that forks for it leaves $PPID on that short-lived wrapper.
    '    case "${openkodo_agent_stat%%) *}" in *" (sh"|*" (dash"|*" (bash"|*" (zsh")',
    '      while IFS= read -r openkodo_agent_line || [ -n "$openkodo_agent_line" ]; do openkodo_agent_cmdline="$openkodo_agent_cmdline$openkodo_agent_line "; openkodo_agent_line=; done 2>/dev/null < "/proc/$openkodo_agent_pid/cmdline"',
    '      case "$openkodo_agent_cmdline" in *OPENKODO_HOOK_AGENT_PID=*)',
    '        case "$openkodo_agent_ppid" in ""|0|1|*[!0-9]*) ;; *)',
    '          if [ -r "/proc/$openkodo_agent_ppid/stat" ]; then',
    '            openkodo_agent_pid=$openkodo_agent_ppid openkodo_agent_stat= openkodo_agent_line= openkodo_agent_start=',
    '            while IFS= read -r openkodo_agent_line || [ -n "$openkodo_agent_line" ]; do openkodo_agent_stat="$openkodo_agent_stat$openkodo_agent_line "; openkodo_agent_line=; done 2>/dev/null < "/proc/$openkodo_agent_pid/stat"',
    '            openkodo_agent_stat_fields ${openkodo_agent_stat##*) }',
    '          fi ;; esac ;; esac ;; esac',
    '    IFS= read -r openkodo_agent_boot 2>/dev/null < /proc/sys/kernel/random/boot_id',
    '    case "$openkodo_agent_start" in ""|*[!0-9]*) ;; *)',
    '      [ -z "$openkodo_agent_boot" ] || openkodo_agent_process="{\\"pid\\":$openkodo_agent_pid,\\"platform\\":\\"linux\\",\\"startTime\\":\\"$openkodo_agent_boot:$openkodo_agent_start\\"}" ;; esac',
    // Bash sets OSTYPE on macOS; other shells still ask uname.
    '  elif case "${OSTYPE-}" in darwin*) ;; *) [ "$(uname -s 2>/dev/null)" = Darwin ] ;; esac; then',
    '    openkodo_agent_cmdline=$(exec /bin/ps -p "$openkodo_agent_pid" -o ppid=,args= 2>/dev/null)',
    '    openkodo_agent_cmdline=${openkodo_agent_cmdline#"${openkodo_agent_cmdline%%[! ]*}"}',
    '    openkodo_agent_ppid=${openkodo_agent_cmdline%% *}',
    '    openkodo_agent_cmdline=${openkodo_agent_cmdline#* }',
    '    openkodo_agent_cmdline=${openkodo_agent_cmdline#"${openkodo_agent_cmdline%%[! ]*}"}',
    // Match the shell on argv[0] only: an agent's prompt in its args can quote this wrapper.
    '    case "${openkodo_agent_cmdline%% *}" in sh|*/sh|dash|*/dash|bash|*/bash|zsh|*/zsh)',
    '      case "$openkodo_agent_cmdline" in *OPENKODO_HOOK_AGENT_PID=*)',
    '        case "$openkodo_agent_ppid" in ""|0|1|*[!0-9]*) ;; *) openkodo_agent_pid=$openkodo_agent_ppid ;; esac ;; esac ;; esac',
    // Match the host probe's timezone when comparing local-time lstart strings.
    '    openkodo_agent_start=$(TZ=UTC0 LC_ALL=C exec /bin/ps -p "$openkodo_agent_pid" -o lstart= 2>/dev/null)',
    '    openkodo_agent_start=${openkodo_agent_start#"${openkodo_agent_start%%[! ]*}"}',
    '    openkodo_agent_start=${openkodo_agent_start%"${openkodo_agent_start##*[! ]}"}',
    '    [ -z "$openkodo_agent_start" ] || openkodo_agent_process="{\\"pid\\":$openkodo_agent_pid,\\"platform\\":\\"darwin\\",\\"startTime\\":\\"$openkodo_agent_start\\"}"',
    '  fi ;;',
    'esac',
    ...buildHookTmuxPaneCapture()
  ]
}

/** A tmux pane's own server, socket and pane id: a hook from inside tmux names a conversation its
 *  server, not the OpenKodo pane, keeps alive; also a lookup hint for the host's attachment check. */
export function buildHookTmuxPaneCapture(): string[] {
  return [
    'openkodo_tmux_pane=',
    'case "${TMUX_PANE:-}" in %[0-9]*) [ -z "${TMUX:-}" ] || openkodo_tmux_pane="$TMUX_PANE ${TMUX%,*,*}" ;; esac',
    '[ "$openkodo_tmux_pane" != "${OPENKODO_INHERITED_TMUX:-}" ] || openkodo_tmux_pane='
  ]
}
