# Hello TSX

A components panel written in TSX with no build step and no `dist/` folder. OpenKodo transpiles
`src/*.tsx` and `src/*.ts` when the panel loads (types stripped, JSX compiled for `openkodo`, relative
imports such as `./todos` resolved to their files).

```sh
openkodo plugin dev load .   # also writes .openkodo/types, the typings tsconfig.json extends
npx tsc -p .             # optional type check
openkodo plugin check .      # renders the panel once and reports errors with file:line
```

Import only `openkodo` and relative files: there is no bundler, so `import 'react'` fails with an
error naming the file and the import.

It shows the components API: keyed atoms persisted per plugin (`src/todos.ts`), `derived`
values, `setup(ctx)` subscribing to the typed `on('theme')` event, and `ui.has` feature
detection.
