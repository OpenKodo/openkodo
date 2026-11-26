---
name: openkodo-computer-use
description: >-
  Drives the GUI of a local app window in the background through `openkodo computer`,
  without bringing it forward or taking the user's keyboard and pointer where the
  platform allows: accessibility tree, clicks, typing, menus, dialogs, and screenshots
  in native apps and external browser windows (Chrome, Edge, Safari) or webviews.
  Prefer a programmatic path (shell, filesystem, git, HTTP, existing CLIs) whenever
  it can complete the task. Use only when an app window needs GUI control those
  cannot reach. Do not use for OpenKodo's embedded browser (`openkodo-cli`).
---

# OpenKodo Computer Use

This discovery stub loads the version-matched guide from the OpenKodo executable used for this session.

## Resolve the CLI for this session

Choose the executable once and reuse it for every later command:

- If the `OPENKODO_CLI_COMMAND` environment variable is set, use its value. OpenKodo exports this
  for managed WSL sessions.
- Otherwise, in a dev checkout whose session exposes `OPENKODO_DEV_REPO_ROOT`, use `openkodo-dev`.
- Otherwise, use `openkodo`.

Every example below spells that command as `openkodo`. If you resolved a different executable
above, substitute it; do not create a shell variable or run a placeholder literally. This works
the same way in POSIX shells, PowerShell, and cmd.exe.

If the selected executable cannot run, report its exact error and stop. Do not fall through
to another executable, which could silently target a different OpenKodo build.

## Load the version-matched guide before running OpenKodo commands

```text
openkodo skills get computer-use
```

Prefer `--json`. Use the selected executable's `--help` for commands or flags the guide does
not cover. A `runtime_unavailable` error is usually transient while OpenKodo is busy or
restarting: wait a few seconds and retry the command. Before retrying a command that changes
something, check whether it already took effect, and reuse any request ID the error names.
`openkodo open` can bring OpenKodo's window to the front over the user's work, so never run it to
retry a failed command. Run it only when the user asks, or when OpenKodo is really not running:
`openkodo status --json` reports `result.app.running: false`, or every command, `openkodo status`
included, still cannot connect after about 30 seconds of retries. If a command fails with
`runtime_access_denied`, your sandbox blocked the connection: re-run it with escalated
permissions, and do not run `openkodo open` or restart OpenKodo. If `skills get` is unknown, explain
that updating OpenKodo restores the guide; use `--help` for read-only discovery and do not guess
unsupported commands.
