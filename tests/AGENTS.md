# Automated App Launches

- Set `OPENKODO_BACKGROUND_LAUNCH=1` for all tests and agent-launched apps. Use
  [`openkodo-app.ts`](e2e/desktop/electron-fixtures/openkodo-app.ts) / [`openkodo-restart.ts`](e2e/desktop/electron-fixtures/openkodo-restart.ts);
  raw `electron.launch()` calls must pass the env explicitly.
- Keep windows hidden and drive renderers through Playwright CDP. Never reveal windows,
  steal focus, or activate the app on the user's desktop. `@headful` is for tests requiring
  real pixels; it does not authorize foreground activation. Never set `OPENKODO_E2E_FOREGROUND=1`
  on the desktop.
- Run native-focus and visible-window tests only on an isolated display or CI.
- Rebuild modified launch-policy code before launching; stale wrappers are unsafe.
