---
name: orchestration
description: >-
  Run work in separate OpenKodo worker agents and get their results back. Use when
  the user invokes /orchestration, asks for OpenKodo workers or supervision
  (monitor, task DAGs, ask/reply, decision gates), or asks to split,
  parallelize or fan out code changes across agents, worktrees or branches;
  use OpenKodo workers for those. Also use when the work needs a different agent
  (such as Codex from Claude) or its own OpenKodo workspace: "Have Codex (or
  Claude) review this and report back" means an OpenKodo worker of that agent.
  Also use when you are a dispatched worker (a prompt with Task and Dispatch
  IDs: ask, worker_done). Unless the user asks for OpenKodo workers or a named
  agent, searches, reads and research in your workspace stay with your own
  subagents, even in parallel. Use `openkodo-cli` to hand work off
  with nothing expected back ("hand off", "handover", "give this to another
  agent", "another worktree"), and for terminal control, shell commands,
  worktree management, and reading or waiting on terminals.
---

# OpenKodo Orchestration

This discovery stub loads the version-matched guide from the OpenKodo executable used for this session.

Never substitute a non-OpenKodo subagent tool when the user asked for OpenKodo orchestration.

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
openkodo skills get orchestration
```

That prints the compact, version-matched guide for the exact binary that will handle your
next commands. It covers the normal local coordinator loop and dispatched-worker
obligations. For a conditional action gate such as remote placement, uncertain release
recovery, or expanded DAG work, load only the reference that gate names with
`openkodo skills get orchestration --reference references/<file>.md`
(`--references` lists the names). If that binary rejects `--reference`, run
`openkodo skills get orchestration --full` and read the named bundled reference before acting.

Use the selected executable's `--help` for commands or flags the guide does not cover. A
`runtime_unavailable` error is usually transient while OpenKodo is busy or restarting: wait a few
seconds and retry the command. Before retrying a command that changes something, check whether
it already took effect, and reuse any request ID the error names. `openkodo open` can bring OpenKodo's
window to the front over the user's work, so never run it to retry a failed command. Run it only
when the user asks, or when OpenKodo is really not running: `openkodo status --json` reports
`result.app.running: false`, or every command, `openkodo status` included, still cannot connect
after about 30 seconds of retries. If a command fails with `runtime_access_denied`, your
sandbox blocked the connection: re-run it with escalated permissions, and do not run
`openkodo open` or restart OpenKodo. If `skills get` is unknown,
explain that updating OpenKodo restores the guide; use `--help` for read-only discovery and do not
guess unsupported commands.
