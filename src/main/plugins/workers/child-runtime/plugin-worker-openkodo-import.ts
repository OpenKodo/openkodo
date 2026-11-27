// No `node:module` import here: `openkodo plugin test` loads this on Node 20.6, which has no registerHooks.

export const isOpenKodoSpecifier = (specifier: string): boolean =>
  specifier === 'openkodo' || specifier.startsWith('openkodo/')

/** Why a worker cannot import `openkodo` at run time; `openkodo plugin test` says the same. */
export function pluginWorkerOpenKodoImportMessage(specifier: string): string {
  return `cannot import "${specifier}" at run time: it only provides types. Write \`import type { OpenKodoWorkerApi } from 'openkodo/worker'\` and use the \`openkodo\` object passed to activate(openkodo).`
}
