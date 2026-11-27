#!/bin/bash
# Remove only our install-owned symlink; preserve any unrelated /usr/bin/openkodo-ide.
set -e

# RPM passes an instance count; dpkg passes the package lifecycle action.
case "${1-}" in
  0 | remove | purge) ;;
  *) exit 0 ;;
esac

link="/usr/bin/openkodo-ide"

if [ -L "$link" ]; then
  target="$(readlink "$link" || true)"
  case "$target" in
    /opt/OpenKodo/*|/opt/openkodo-ide/*|/opt/openkodo/*)
      rm -f "$link"
      ;;
  esac
fi

exit 0
