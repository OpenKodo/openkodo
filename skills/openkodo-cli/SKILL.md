---
name: openkodo-cli
description: >-
  Operate OpenKodo-managed worktrees, folder contexts, terminals, repos, automations, worktree
  comments, and OpenKodo's embedded browser through the `openkodo` CLI. Use when the user says
  "$openkodo-cli", "OpenKodo worktree", "child worktree", "spawn codex/claude in a worktree",
  "read/wait/send OpenKodo terminal", "handoff" / "handover" / "give this to another agent",
  "ask/tell/message another agent" (including an agent on a paired OpenKodo server), or
  "OpenKodo browser". Also use for opening, testing, screenshotting, or checking how a local or
  external web page renders while working in OpenKodo, unless the user or project names another
  browser tool; plain HTTP or API calls (curl, fetch) do not need it. Prefer it over raw git
  worktree, ad hoc PTYs, or Computer Use when OpenKodo state is involved. Use Computer Use only
  when a visible window needs GUI control that a CLI, filesystem, or API cannot do.
---

# OpenKodo CLI

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
openkodo skills get openkodo-cli
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
