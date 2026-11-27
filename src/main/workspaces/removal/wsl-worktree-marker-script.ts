import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import type { RemoveLocalWorktreeMarkerOptions } from './local-worktree-filesystem'

const PARSE_OPENKODO_GITDIR_LINE = [
  'openkodo_line=$(LC_ALL=C head -n 1 ./.git)',
  'openkodo_line="${openkodo_line%"${openkodo_line##*[![:space:]]}"}"',
  'case "$openkodo_line" in [Gg][Ii][Tt][Dd][Ii][Rr]:*) openkodo_gitdir=${openkodo_line#*:}; openkodo_gitdir="${openkodo_gitdir#"${openkodo_gitdir%%[![:space:]]*}"}" ;; *) openkodo_gitdir="" ;; esac'
].join(' && ')

const VERIFY_MARKER_BATCH_AND_RM = quotePosixShell(
  [
    'openkodo_t=$1; openkodo_rm=$2; openkodo_mid=$3; openkodo_sgd=$4; shift 4;',
    '[ "$(LC_ALL=C stat -c \'%F#%d:%i\' -- "$openkodo_t" 2>/dev/null)" = "$openkodo_rm" ] || exit 4;',
    '[ "$(LC_ALL=C stat -c \'%F#%d:%i\' -- . 2>/dev/null)" = "$openkodo_rm" ] || exit 4;',
    "if openkodo_m=$(LC_ALL=C stat -c '%F#%d:%i' -- ./.git 2>&1); then",
    "case \"$openkodo_m\" in 'regular file#'*|'regular empty file#'*) ;; *) exit 4 ;; esac;",
    '[ "${openkodo_m#*#}" = "$openkodo_mid" ] || exit 4;',
    'openkodo_line=$(LC_ALL=C head -n 1 ./.git) || exit 4;',
    'openkodo_line="${openkodo_line%"${openkodo_line##*[![:space:]]}"}";',
    'case "$openkodo_line" in [Gg][Ii][Tt][Dd][Ii][Rr]:*) openkodo_gd=${openkodo_line#*:}; openkodo_gd="${openkodo_gd#"${openkodo_gd%%[![:space:]]*}"}" ;; *) openkodo_gd="" ;; esac;',
    '[ "$openkodo_gd" = "$openkodo_sgd" ] || exit 4;',
    'LC_ALL=C exec rm -rf -- "$@";',
    "else case \"$openkodo_m\" in *': No such file or directory'|*': Not a directory') exit 0 ;; *) printf '%s\\n' \"$openkodo_m\" >&2; exit 1 ;; esac; fi"
  ].join(' ')
)

const VERIFY_MARKERLESS_BATCH_AND_RM = quotePosixShell(
  [
    'openkodo_t=$1; openkodo_rm=$2; shift 2;',
    '[ "$(LC_ALL=C stat -c \'%F#%d:%i\' -- "$openkodo_t" 2>/dev/null)" = "$openkodo_rm" ] || exit 4;',
    '[ "$(LC_ALL=C stat -c \'%F#%d:%i\' -- . 2>/dev/null)" = "$openkodo_rm" ] || exit 4;',
    "if LC_ALL=C stat -c '%F' -- ./.git >/dev/null 2>&1; then exit 4; fi;",
    'LC_ALL=C exec rm -rf -- "$@"'
  ].join(' ')
)

// Pin the sweep to a subshell cwd verified against openkodo_root_meta, re-verify before each rm batch, and exit the subshell before rmdir (#16463).
export function buildWslMarkerLastScript(
  target: string,
  {
    expectedMarker,
    forbidAnyMarker = false,
    expectedRoot,
    requireMarker = false
  }: RemoveLocalWorktreeMarkerOptions
): string {
  const expectedClause = forbidAnyMarker
    ? ' || true'
    : expectedMarker !== undefined
      ? ` || [ "$openkodo_gitdir#$openkodo_marker_ino" != ${quotePosixShell(expectedMarker)} ]`
      : ''
  const expectedRootClause =
    expectedRoot !== undefined
      ? `if [ "\${openkodo_root_meta#*#}" != ${quotePosixShell(expectedRoot)} ]; then exit 4; fi;`
      : ''
  const markerlessBranch = requireMarker
    ? "if LC_ALL=C stat -c '%F' -- ./.git >/dev/null 2>&1; then exit 4; fi;"
    : [
        "if LC_ALL=C stat -c '%F' -- ./.git >/dev/null 2>&1; then exit 4; fi &&",
        `openkodo_find_status=0; LC_ALL=C find -P . -mindepth 1 -maxdepth 1 ! -name .git -exec sh -c ${VERIFY_MARKERLESS_BATCH_AND_RM} sh "$openkodo_target" "$openkodo_root_meta" {} + || openkodo_find_status=$?;`,
        'openkodo_cur_root=$(LC_ALL=C stat -c \'%F#%d:%i\' -- "$openkodo_target") || exit $? &&',
        'case "$openkodo_cur_root" in \'directory#\'*) ;; *) echo "Refusing to delete non-directory worktree path" >&2; exit 3 ;; esac &&',
        'if [ "$openkodo_cur_root" != "$openkodo_root_meta" ]; then exit 4; fi &&',
        "if openkodo_after=$(LC_ALL=C stat -c '%F' -- ./.git 2>&1); then exit 4;",
        'else case "$openkodo_after" in *\': No such file or directory\'|*\': Not a directory\') if [ "$openkodo_find_status" -ne 0 ]; then exit "$openkodo_find_status"; fi ;; *) printf \'%s\\n\' "$openkodo_after" >&2; exit 1 ;; esac; fi;'
      ].join(' ')
  return [
    `openkodo_target=${target};`,
    'openkodo_root_meta=$(LC_ALL=C stat -c \'%F#%d:%i\' -- "$openkodo_target") || exit $?;',
    'case "$openkodo_root_meta" in \'directory#\'*) ;; *) echo "Refusing to delete non-directory worktree path" >&2; exit 3 ;; esac;',
    expectedRootClause,
    '( cd -P -- "$openkodo_target" || exit $?;',
    "openkodo_pwd_meta=$(LC_ALL=C stat -c '%F#%d:%i' -- .) || exit $?;",
    'if [ "$openkodo_pwd_meta" != "$openkodo_root_meta" ]; then exit 4; fi;',
    "if openkodo_meta=$(LC_ALL=C stat -c '%F#%d:%i#%i' -- ./.git 2>&1); then openkodo_has_git=1;",
    "else case \"$openkodo_meta\" in *': No such file or directory'|*': Not a directory') openkodo_has_git=0 ;; *) printf '%s\\n' \"$openkodo_meta\" >&2; exit 1 ;; esac; fi;",
    'if [ "$openkodo_has_git" = 1 ]; then',
    "case \"$openkodo_meta\" in 'regular file#'*|'regular empty file#'*) ;; *) exit 4 ;; esac &&",
    'openkodo_rest=${openkodo_meta#*#} && openkodo_marker_id=${openkodo_rest%#*} && openkodo_marker_ino=${openkodo_rest#*#} &&',
    `${PARSE_OPENKODO_GITDIR_LINE} &&`,
    `if [ -z "$openkodo_gitdir" ]${expectedClause}; then exit 4; fi &&`,
    'openkodo_saved_gitdir=$openkodo_gitdir &&',
    `openkodo_find_status=0; if [ -n "$(LC_ALL=C find -P . -mindepth 1 -maxdepth 1 -name .git -print)" ]; then LC_ALL=C find -P . -mindepth 1 -maxdepth 1 ! -name .git -exec sh -c ${VERIFY_MARKER_BATCH_AND_RM} sh "$openkodo_target" "$openkodo_root_meta" "$openkodo_marker_id" "$openkodo_saved_gitdir" {} + || openkodo_find_status=$?; else LC_ALL=C find -P . -mindepth 1 -maxdepth 1 \\( ! -iname .git -o ! -samefile ./.git \\) -exec sh -c ${VERIFY_MARKER_BATCH_AND_RM} sh "$openkodo_target" "$openkodo_root_meta" "$openkodo_marker_id" "$openkodo_saved_gitdir" {} + || openkodo_find_status=$?; fi;`,
    'openkodo_cur_root=$(LC_ALL=C stat -c \'%F#%d:%i\' -- "$openkodo_target") || exit $? &&',
    'case "$openkodo_cur_root" in \'directory#\'*) ;; *) echo "Refusing to delete non-directory worktree path" >&2; exit 3 ;; esac &&',
    'if [ "$openkodo_cur_root" != "$openkodo_root_meta" ]; then exit 4; fi &&',
    "if openkodo_after=$(LC_ALL=C stat -c '%F#%d:%i' -- ./.git 2>&1); then",
    "case \"$openkodo_after\" in 'regular file#'*|'regular empty file#'*) ;; *) exit 4 ;; esac &&",
    'if [ "${openkodo_after#*#}" != "$openkodo_marker_id" ]; then exit 4; fi &&',
    `${PARSE_OPENKODO_GITDIR_LINE} &&`,
    'if [ "$openkodo_gitdir" != "$openkodo_saved_gitdir" ]; then exit 4; fi &&',
    'if [ "$openkodo_find_status" -ne 0 ]; then exit "$openkodo_find_status"; fi &&',
    'LC_ALL=C rm -f -- ./.git;',
    'else case "$openkodo_after" in *\': No such file or directory\'|*\': Not a directory\') if [ "$openkodo_find_status" -ne 0 ]; then exit "$openkodo_find_status"; fi ;; *) printf \'%s\\n\' "$openkodo_after" >&2; exit 1 ;; esac; fi;',
    'else',
    markerlessBranch,
    'fi ) || exit $?;',
    'openkodo_cur_root=$(LC_ALL=C stat -c \'%F#%d:%i\' -- "$openkodo_target") || exit $?;',
    'case "$openkodo_cur_root" in \'directory#\'*) ;; *) echo "Refusing to delete non-directory worktree path" >&2; exit 3 ;; esac;',
    'if [ "$openkodo_cur_root" != "$openkodo_root_meta" ]; then exit 4; fi;',
    'if ! LC_ALL=C rmdir -- "$openkodo_target"; then',
    'if LC_ALL=C stat -c \'%F\' -- "$openkodo_target/.git" >/dev/null 2>&1; then exit 4; fi;',
    `if [ -n "$(LC_ALL=C ls -A -- "$openkodo_target" 2>/dev/null)" ]; then exit ${requireMarker ? '4' : '5'}; fi;`,
    'exit 1;',
    'fi'
  ]
    .filter(Boolean)
    .join(' ')
}
