/**
 * Features inherited from the upstream workbench that are not part of OpenKodo
 * Code's product: one subscription, one IDE, one API. They stay in the tree
 * until their modules are deleted, but no surface may lead to them.
 */
export const RETIRED_SETTINGS_SECTIONS = [
  'accounts',
  'artifacts',
  'automations',
  'bots',
  'chat',
  'computer-use',
  'dev',
  'developer-permissions',
  'experimental',
  'floating-workspace',
  'linear',
  'mobile',
  'mobile-emulator',
  'shared-links',
  'tasks',
  'voice',
  'workflows'
] as const

const retired = new Set<string>(RETIRED_SETTINGS_SECTIONS)

export function isRetiredSettingsSection(id: string): boolean {
  return retired.has(id)
}

/** Top-level CLI commands that belong to a retired feature. */
export const RETIRED_CLI_COMMANDS = new Set([
  'account',
  'artifacts',
  'automations',
  'bot',
  'computer',
  'emulator',
  'google',
  'jira',
  'linear',
  'pair',
  'slack',
  'vm',
  'webhook'
])
