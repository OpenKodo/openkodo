# Built-in browser commands

Pin one page, snapshot it once, then act on it. Each action reports what it changed, so you rarely need to snapshot again:

```text
openkodo tab current --json
openkodo goto --page <browserPageId> --url https://example.com --json
openkodo snapshot --page <browserPageId> --interactive
openkodo click --page <browserPageId> --element @e3 --json
```

Choosing what to look at, cheapest first:

- `snapshot --interactive` lists only controls and links with their refs, often under half the size of the whole tree. It leaves out page text, including error and status messages.
- `--delta` is the cheap second look, for example after a `wait` with no action in between: it returns only what changed since the last `--delta` snapshot of that page, as "no change" or which lines of that tree to replace and with what. Each page keeps one baseline: a navigation, a large change, or a `--delta` call with different flags returns the whole tree again and replaces it. `--full` asks for the whole tree and restarts the baseline.
- `--selector <css>` limits the tree to one part of the page, `--depth <n>` limits nesting, `--compact` drops empty structure, and `--urls` adds link targets.
- To read page text, run `exec --command "read"` (the page as Markdown) or a plain `snapshot` (the whole tree with its text).
- `screenshot` saves a PNG of the visible page and prints its path; open that file to see the page. In OpenKodo's desktop browser its pixels are CSS pixels, so x/y read off it work with `openkodo mouse`. `full-screenshot` saves the whole page the same way. `--annotate` labels each control with its ref, and `--if-changed` saves nothing when the page looks the same as last time.

Common commands:

```text
openkodo goto --page <browserPageId> --url <url> --json
openkodo back --page <browserPageId> --json
openkodo reload --page <browserPageId> --json
openkodo snapshot --page <browserPageId> --interactive
openkodo snapshot --page <browserPageId> --interactive --delta
openkodo snapshot --page <browserPageId> --selector main --depth 4
openkodo screenshot --page <browserPageId>
openkodo screenshot --page <browserPageId> --annotate
openkodo full-screenshot --page <browserPageId>
openkodo pdf --page <browserPageId> --json
openkodo click --page <browserPageId> --element <ref> --json
openkodo fill --page <browserPageId> --element <ref> --value <text> --json
<secret reader> | openkodo fill --page <browserPageId> --element <ref> --value-stdin --json
openkodo type --page <browserPageId> --input <text> --json
openkodo select --page <browserPageId> --element <ref> --value <value> --json
openkodo check --page <browserPageId> --element <ref> --json
openkodo scroll --page <browserPageId> --direction down --amount 1000 --json
openkodo hover --page <browserPageId> --element <ref> --json
openkodo focus --page <browserPageId> --element <ref> --json
openkodo keypress --page <browserPageId> --key Enter --json
openkodo upload --page <browserPageId> --element <ref> --files <paths> --json
openkodo wait --page <browserPageId> --text <text> --json
openkodo wait --page <browserPageId> --url <substring> --json
openkodo wait --page <browserPageId> --selector <css> --json
openkodo wait --page <browserPageId> --load load --json
openkodo eval --page <browserPageId> --expression <js> --json
openkodo dialog accept --page <browserPageId> [--text <answer>] --json
openkodo dialog dismiss --page <browserPageId> --json
openkodo set device --page <browserPageId> --name "iPhone 15" --json
openkodo viewport --page <browserPageId> --width 390 --height 844 --scale 3 --mobile --json
openkodo tab list --json
openkodo tab create --url <url> --json
openkodo tab create --url <url> --split right --json
openkodo tab switch --index <n> --json
openkodo tab close --index <n> --json
openkodo cookie get --page <browserPageId> --json
openkodo capture start --page <browserPageId> --json
openkodo console --page <browserPageId> --limit 50 --json
openkodo network --page <browserPageId> --limit 50 --json
openkodo exec --page <browserPageId> --command "read" --json
openkodo exec --page <browserPageId> --command "get text @e3" --json
```

Browser rules:

- Actions (`click`, `fill`, `type`, `keypress`, `select`, `check`, `hover`, `scroll`, `goto`, `back`, `reload`, `mouse` and the rest) wait briefly for the page to settle and then report what they caused in `result.effects` (text mode prints it under the action): `url`/`title` when they changed, `newTabs` with their `browserPageId`, blocked or opened `popups`, `downloads` started, `consoleErrors`, a `passkeyRequest` still waiting, `blockedPrint` when OpenKodo refused the page's system print dialog (run `openkodo pdf` to save the page instead), and `page`: `"unchanged"`, or the snapshot lines the action added or replaced, with their refs (`full: true` means the whole new page). `loading: true` means a navigation was still running: `wait --load load`, then `snapshot`. No `page` means the page could not be read: run `snapshot`. `settled: false` means the page was still changing when it was read. An action that opens a JavaScript dialog fails with `browser_dialog_opened` instead. One that opens a file picker fails with `browser_file_chooser_opened`: OpenKodo closes the picker so the system dialog never covers the user's screen; use `openkodo upload` on the file input or its button instead.
- Snapshot again only when `page.truncated` is true, after `wait`, after a tab switch, on a `browser_stale_ref`, or when a result has no `effects` (older OpenKodo, or a server-hosted page).
- Pass `--expect-url <url>` with `--page` when acting on the wrong resource would matter, such as writing or sending in one conversation of a chat app. Use the exact absolute URL from `result.tab.url` in `openkodo tab current --json`, or `url` from a `snapshot --json` or `goto`. Path, query and fragment must all match, so a page that rewrites its URL while you work refuses until you read the URL again. If the page's URL differs, or a navigation to another URL is under way, the command fails with `browser_expected_url_mismatch`, and `error.data` holds `expectedUrl`, `actualUrl`, `browserPageId` and `mayHaveStarted`. `mayHaveStarted: false` means nothing ran; `true` means a step of a longer command (a typed run, a `select-all`) may have happened, so look at the page before retrying. Success adds `browserPageId` and `checkedUrl`, the URL last checked; the action itself may have navigated since, and `effects.url` says where. The check runs right before the action and again before each later step, but it is not a lock: a route change in the instant after a check can still receive the action. It compares the top-level page only, so it says nothing about an iframe or an app that shows different content at one URL; read the page for those. `exec` refuses the flag, because one raw batch can navigate and retarget. A runtime, client or desktop that cannot check the URL refuses with `incompatible_runtime` or `browser_expect_url_unsupported` rather than acting unguarded.
- Refs like `@e1` are assigned by `snapshot`, scoped to one tab, and invalidated by navigation or tab switch.
- Pass `--page <browserPageId>` on every command that acts on one page; `openkodo <command> --help` lists `--page` when it does. `tab list`, `tab current`, `tab create` and `open-url` take no `--page`, and `tab switch`/`tab close` pick a tab by `--index` or `--page`, never both, since `--page` wins. Take the ID from `result.tab.browserPageId` in `openkodo tab current --json` or `result.browserPageId` in `openkodo tab create --json` and keep it for the task; `tab current` shows the routed tab, not the one you pin. When the user means a specific tab, find it by URL or title in `openkodo tab list --json`.
- Without `--page`, a command goes to the worktree's current tab. That stays the agent's tab while it has had a command in the last 20 seconds or so, even after the user picks another (`tab current` reports it too), then moves to the user's pick.
- After `openkodo tab switch`, pass the new page's `browserPageId`.
- When the user says they left notes or comments on a page, read them with `openkodo tab annotations --page <browserPageId>` (the current tab without `--page`). It prints the notes they haven't sent, the same text the tab's Copy button gives, and `--json` returns them in `result.annotations`. Notes the user already sent arrive in your chat instead.
- Passkey, fingerprint, Face ID, Windows Hello and security-key prompts can't be completed by you. When `snapshot` or an action's `effects` has `passkeyRequest`, the page is waiting on one from that origin and will wait for minutes. Ask the user to finish the sign-in, or run `openkodo dialog dismiss --page <browserPageId>` to cancel it so the page offers another way to sign in.
- A popup window a page opens (sign-in, payment) is listed in `openkodo tab list --json` as a `popup-<n>` page with `openerBrowserPageId`. If a click seems to do nothing, check `tab list`, then drive the popup with `--page popup-<n>`. When it closes, continue on the opener page.
- Browser commands default to the worktree you are in: your cwd's worktree, else your OpenKodo terminal's. Outside both (a shell or IDE OpenKodo did not open, with a cwd outside any worktree), and on every `--environment` command, always pass `--page <browserPageId>` or `--worktree <selector>` (not `all`); find pages with `openkodo tab list --json`. Without either, a local command acts on the tab the user is looking at, and an `--environment` command is refused. `--page` reaches the page in any worktree unless you also pass `--worktree <selector>`. Use `--worktree all` only intentionally.
- `tab list` shows every tab in the tab bar. After a restart, tabs the user has not opened report `loaded: false`; `tab switch` or any `--page` command loads one in the background without changing the user's visible tab.
- `tab create` and `tab switch` leave the user's visible tab alone. Add `--focus` only when the user asked to see the page: it becomes the visible tab of its worktree, also from an SSH host, and never switches the user's worktree.
- `tab create --split <right|left|down|up>` opens the page in a new pane beside the calling terminal instead of as another tab; focus stays in the terminal. When a browser pane is already open beside it, the page opens as that pane's visible tab instead of adding another pane. On a host with no OpenKodo window, such as a server, the page opens as a plain tab instead.
- Use typed tab commands (`openkodo tab list/create/close/switch`), not `openkodo exec --command "tab ..."`, so OpenKodo keeps UI state synchronized.
- Use `openkodo set device` or `openkodo viewport --mobile`, not `openkodo exec --command "set device ..."`, so the page also gets touch input and `pointer: coarse`. Each page load (reload, `goto`, link click) resets it, so run it again after navigating.
- Prefer `wait --text`, `--url`, `--selector`, or `--load` after async page changes instead of bare timeouts. Avoid `--load networkidle` except on pages known to go quiet: polling, websockets and streaming keep it from ever resolving.
- Anything not listed above goes through `openkodo exec --page <browserPageId> --command "<agent-browser command>"`, which takes agent-browser's own command syntax (for example `"get text @e3"` or `"is visible @e3"`) and prints JSON. It has no `help` command.
- `upload` takes the file input itself or the button that opens a file picker, in any frame, including cross-origin iframes; OpenKodo catches the picker and sets the files on its input. Use `openkodo upload`, not `openkodo exec --command "upload ..."`. On server-hosted pages pass the file input's ref.
- `fill` sets a field's whole value in one step, at any size. `type` presses real keys into the focused element, so `minlength`/`maxlength`, key handlers, Enter and Tab act as they would for a person; `openkodo focus` the element first. Use `type` when the page reacts to keystrokes.
- Fill passwords and other secrets with `--value-stdin`, not `--value`: argv is visible to `ps` and shell history. One trailing newline is dropped.
- On server-hosted pages `fill` and `type` still insert text the engine's own way. If either does nothing on a custom input there, try `openkodo focus --page <browserPageId> --element @e1 --json` then `openkodo inserttext --page <browserPageId> --text "text" --json`.
- A client-hosted page renders in the paired desktop's browser engine, so every command against it needs that desktop online and returns `browser_host_unavailable` while it is closed, asleep, or disconnected. Server-hosted pages run with no desktop attached; prefer them for long or unattended automation. On a Linux server, WSL or SSH host, `tab create` fails when no OpenKodo desktop can show the tab; `openkodo tab create --headless` opens it in the host's own headless browser instead, which nobody sees.

Common recoveries:

- `browser_no_tab`: open a tab with `openkodo tab create --url <url> --json`.
- `browser_stale_ref`: run `openkodo snapshot --page <browserPageId> --json` and retry on the same page with fresh refs.
- `browser_element_not_interactable`: the element can't take that command, and the message says why (not a text field, disabled, read-only, not a `<select>`, opened no file picker). Re-snapshot and pick the right ref; for a custom dropdown, click it and then click the option.
- `browser_tab_not_found`: run `openkodo tab list --json` before switching or closing.
- `browser_dialog_open` / `browser_dialog_opened`: the page has a JavaScript alert, confirm or prompt open, and the error quotes it. Answer it with `openkodo dialog accept` (`--text` for a prompt; without it a prompt takes its default) or `openkodo dialog dismiss` before any other command on that page; a command that opened it may already have taken effect, so check before repeating it.
- `browser_focus_guard_unavailable` or `browser_user_composing` (the message starts "OpenKodo could not protect the user's keyboard focus" or "The user is typing with an input method"): the refused step was not sent. Retry a `click`, `fill`, `clear`, `focus` or `select-all` as is. For `type`, `keypress` and other multi-key input, read the field first: keys before the refused one may have landed. A focus refusal naming `missing_page` or `missing_renderer` means no OpenKodo window shows the page, so run `openkodo tab list --json` instead of retrying.
- `browser_host_unavailable`: the desktop hosting the page is offline. Bring it back, or recreate the page with server placement if the work must outlive the desktop session.
