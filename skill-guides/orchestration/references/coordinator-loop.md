# Coordinator loop

## Task DAGs

A Task needs a Run, so create one first. Workers editing the same files at once
need separate workspaces.

```text
openkodo orchestration run-create --environment local --objective "<goal>"
openkodo orchestration task-create --environment local --spec "<dependent work>" --deps <json_array>
openkodo orchestration task-list --environment local --ready --brief
openkodo orchestration worker-start --environment local --task <task_id> --worktree current --agent <agent>
```

On every wake, start the Tasks `task-list --ready` shows.

## Several Runs

A later `run-create` keeps your earlier Runs: their mail still wakes you, but
commands without `--run` use the newest Run, so pass `--run <id>` for an earlier
one. `run-use` keeps only the Run it names.
