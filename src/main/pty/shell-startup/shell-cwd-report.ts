// Encode only on folder changes; re-send each prompt so a child shell's report cannot stick.
export const BASH_CWD_REPORT_BLOCK = `__openkodo_osc133_cwd_report() {
  if [[ -n "\${MSYSTEM:-}" && -z "\${WSL_DISTRO_NAME:-}" ]]; then
    # Virtual MSYS mounts need a native path probe; never publish them as Windows root folders.
    case "$PWD" in /[A-Za-z]|/[A-Za-z]/*|//*) ;; *) return 0 ;; esac
  fi
  if [[ "$PWD" != "\${__openkodo_cwd_reported-}" ]]; then
    __openkodo_cwd_reported=$PWD
    local LC_ALL=C __openkodo_e= __openkodo_c __openkodo_i
    for (( __openkodo_i = 0; __openkodo_i < \${#PWD}; __openkodo_i++ )); do
      __openkodo_c=\${PWD:__openkodo_i:1}
      case $__openkodo_c in
        [A-Za-z0-9/._~-]) __openkodo_e+=$__openkodo_c ;;
        *) builtin printf -v __openkodo_c '%d' "'$__openkodo_c"; builtin printf -v __openkodo_c '%%%02X' $(( __openkodo_c & 255 )); __openkodo_e+=$__openkodo_c ;;
      esac
    done
    if [[ -n "\${MSYSTEM:-}" && -z "\${WSL_DISTRO_NAME:-}" && "$__openkodo_e" != //* ]]; then
      __openkodo_e="/\${__openkodo_e:1:1}:/\${__openkodo_e:3}"
    fi
    __openkodo_cwd_encoded=$__openkodo_e
  fi
  builtin printf '\\033]7;file://localhost%s\\007' "\${__openkodo_cwd_encoded-}"
}`

export const ZSH_CWD_REPORT_BLOCK = `__openkodo_cwd_report() {
  builtin emulate -L zsh
  builtin setopt no_multibyte
  if [[ $PWD != \${__openkodo_cwd_reported-} ]]; then
    builtin typeset -g __openkodo_cwd_reported=$PWD
    local __openkodo_e= __openkodo_c __openkodo_i
    for (( __openkodo_i = 1; __openkodo_i <= $#PWD; __openkodo_i++ )); do
      __openkodo_c=$PWD[__openkodo_i]
      case $__openkodo_c in
        ([A-Za-z0-9/._~-]) __openkodo_e+=$__openkodo_c ;;
        (*) builtin printf -v __openkodo_c '%d' "'$__openkodo_c"; builtin printf -v __openkodo_c '%%%02X' $(( __openkodo_c & 255 )); __openkodo_e+=$__openkodo_c ;;
      esac
    done
    builtin typeset -g __openkodo_cwd_encoded=$__openkodo_e
  fi
  builtin printf '\\033]7;file://localhost%s\\007' "\${__openkodo_cwd_encoded-}"
}`
