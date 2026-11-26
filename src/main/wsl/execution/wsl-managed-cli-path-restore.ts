/** Leads PATH with the managed WSL CLI after startup files ran; an unusable CLI only warns. */
export const WSL_MANAGED_CLI_PATH_RESTORE = `if [ -n "\${OPENKODO_WSL_CLI_DIR:-}" ]; then
  if [ -x "$OPENKODO_WSL_CLI_DIR/\${OPENKODO_CLI_COMMAND:-}" ]; then
    export PATH="$OPENKODO_WSL_CLI_DIR\${PATH:+:$PATH}"
  else
    printf 'OpenKodo CLI unavailable: cannot run %s. Check WSL Windows-drive mount options.\\n' "$OPENKODO_WSL_CLI_DIR/\${OPENKODO_CLI_COMMAND:-}" >&2
  fi
fi`
