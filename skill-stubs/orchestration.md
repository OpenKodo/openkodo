# OpenKodo Orchestration

This discovery stub loads the version-matched guide from the OpenKodo executable used for this session.

Never substitute a non-OpenKodo subagent tool when the user asked for OpenKodo orchestration.

<!-- shared: resolver -->

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

<!-- shared-omit: no-guessing -->

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
