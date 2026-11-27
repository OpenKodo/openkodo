// Login profiles can rebuild PATH; re-add OpenKodo's CLI first and OpenKodo's own agent copies last.
export const OPENKODO_CLI_POSIX_PATH_RESTORE = `if [ -n "\${OPENKODO_CLI_BIN_DIR:-}" ]; then
  case "\${PATH:-}" in
    "$OPENKODO_CLI_BIN_DIR"|"$OPENKODO_CLI_BIN_DIR":*) ;;
    *) export PATH="$OPENKODO_CLI_BIN_DIR\${PATH:+:$PATH}" ;;
  esac
fi
if [ -n "\${OPENKODO_MANAGED_AGENT_PATH:-}" ]; then
  case ":\${PATH:-}:" in
    *":$OPENKODO_MANAGED_AGENT_PATH:"*) ;;
    *) export PATH="\${PATH:+$PATH:}$OPENKODO_MANAGED_AGENT_PATH" ;;
  esac
fi`
