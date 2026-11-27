/**
 * A WSL bridge sh/dash/ash pane's ENV file (read once, by interactive shells only, after the login
 * profile). It first hands ENV back to the user's own value, so children see theirs, and sources it.
 * Then, inside WSL, it prefixes PS1 with the folder report; dash has no prompt hook, so the report
 * runs in a command substitution and re-encodes $PWD byte by byte every prompt. bash and busybox
 * ash (fancy prompt, on in Alpine's and Debian's builds) get it inside \\[ \\] so the invisible bytes
 * do not count toward the prompt's width; dash has no line editor to miscount, and would print \\[.
 */
export const SH_WSL_ENV_FILE = `# OpenKodo WSL bridge sh ENV: restore the user's ENV, then report the folder (OSC 7) at each prompt.
if [ -n "\${OPENKODO_WSL_USER_ENV:-}" ]; then
  ENV=$OPENKODO_WSL_USER_ENV
  unset OPENKODO_WSL_USER_ENV
  # The shell expands ENV's value before reading it; a here-document does the same without
  # parsing the user's quotes as shell syntax.
  eval "IFS= read -r __openkodo_user_env <<__OPENKODO_USER_ENV_EOF
$ENV
__OPENKODO_USER_ENV_EOF
"
  if [ -r "$__openkodo_user_env" ]; then
    . "$__openkodo_user_env"
  fi
  unset __openkodo_user_env
else
  unset ENV OPENKODO_WSL_USER_ENV
fi
if [ -n "\${WSL_DISTRO_NAME:-}" ]; then
  __openkodo_wsl_cwd_report() {
    LC_ALL=C
    __openkodo_p=$PWD
    __openkodo_e=
    while [ -n "$__openkodo_p" ]; do
      __openkodo_r=\${__openkodo_p#?}
      __openkodo_c=\${__openkodo_p%"$__openkodo_r"}
      __openkodo_p=$__openkodo_r
      case $__openkodo_c in
        [A-Za-z0-9/._~-]) __openkodo_e=$__openkodo_e$__openkodo_c ;;
        *) __openkodo_e=$__openkodo_e$(printf '%%%02X' $(( $(printf '%d' "'$__openkodo_c") & 255 ))) ;;
      esac
    done
    printf '\\033]7;file://%s\\007' "$__openkodo_e"
  }
  case $PS1 in
    *__openkodo_wsl_cwd_report*) ;;
    *)
      if [ -n "\${BASH_VERSION:-}" ] || [ -n "\${BB_ASH_VERSION:-}" ]; then
        PS1='\\[$(__openkodo_wsl_cwd_report)\\]'"$PS1"
      else
        PS1='$(__openkodo_wsl_cwd_report)'"$PS1"
      fi
      ;;
  esac
fi
`
