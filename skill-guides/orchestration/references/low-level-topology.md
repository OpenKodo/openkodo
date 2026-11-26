# Low-level topology

```text
openkodo terminal create --worktree active --title <task_name> --command "<agent_command>" --json
openkodo terminal wait --terminal <handle> --for tui-idle --timeout-ms 60000 --json
openkodo orchestration dispatch --task <task_id> --to <handle> --inject
```

To give a Task to a terminal or chat OpenKodo did not start:

```text
openkodo orchestration worker-start --task <task_id> --terminal <handle> --json
```
