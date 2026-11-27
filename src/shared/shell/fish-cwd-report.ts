// A single event handler keeps cwd reporting independent of the user's prompt function.
export const FISH_CWD_REPORT_BLOCK = `function __openkodo_cwd_report --on-event fish_prompt
  if not set -q __openkodo_cwd_reported; or test "$PWD" != "$__openkodo_cwd_reported"
    set -g __openkodo_cwd_encoded (string escape --style=url -- "$PWD")
    set -g __openkodo_cwd_reported "$PWD"
  end
  builtin printf '\\033]7;file://localhost%s\\007' "$__openkodo_cwd_encoded"
end`
