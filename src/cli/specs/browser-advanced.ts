import type { CommandSpec } from '../discovery/command-spec'
import { CLI_GLOBAL_FLAGS as GLOBAL_FLAGS } from '../../shared/cli/cli-argument-boundary'
import { withBrowserPageTarget } from './browser-page-target'

export const BROWSER_ADVANCED_COMMAND_SPECS: CommandSpec[] = withBrowserPageTarget([
  {
    path: ['extension', 'list'],
    summary: 'List installed browser extensions and their enabled state',
    usage: 'openkodo extension list [--profile <id>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'profile'],
    notes: ['Desktop only. Defaults to the default browser profile on this OpenKodo host.']
  },
  {
    path: ['extension', 'reload'],
    summary: 'Reload an installed unpacked browser extension',
    usage:
      'openkodo extension reload <extension-id> [--json] | openkodo extension reload --path <folder> [--json]',
    positionalArgs: ['extension-id'],
    allowedFlags: [...GLOBAL_FLAGS, 'extension-id', 'path'],
    notes: [
      'Desktop only. --path selects an already installed unpacked source folder; it never installs one.',
      'Like the Settings reload button, this restarts the extension in every profile where it is enabled.'
    ]
  },
  {
    path: ['cookie', 'get'],
    summary: 'Get cookies for the active tab (optionally filter by URL)',
    usage: 'openkodo cookie get [--url <url>] [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'url', 'worktree']
  },
  {
    path: ['cookie', 'set'],
    summary: 'Set a cookie',
    usage:
      'openkodo cookie set --name <n> --value <v> [--domain <d>] [--path <p>] [--secure] [--httpOnly] [--sameSite <s>] [--expires <epoch>] [--worktree <selector>] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'name',
      'value',
      'domain',
      'path',
      'secure',
      'httpOnly',
      'sameSite',
      'expires',
      'worktree'
    ]
  },
  {
    path: ['cookie', 'delete'],
    destructive: true,
    summary: 'Delete a cookie by name',
    usage:
      'openkodo cookie delete --name <n> [--domain <d>] [--url <u>] [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'name', 'domain', 'url', 'worktree']
  },
  {
    path: ['viewport'],
    summary: 'Set browser viewport size',
    usage:
      'openkodo viewport --width <w> --height <h> [--scale <n>] [--mobile] [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'width', 'height', 'scale', 'mobile', 'worktree']
  },
  {
    path: ['geolocation'],
    summary: 'Override browser geolocation',
    usage:
      'openkodo geolocation --latitude <lat> --longitude <lon> [--accuracy <n>] [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'latitude', 'longitude', 'accuracy', 'worktree']
  },
  {
    path: ['intercept', 'enable'],
    summary: 'Enable request interception (pause matching requests)',
    usage: 'openkodo intercept enable [--patterns <glob,...>] [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'patterns', 'worktree']
  },
  {
    path: ['intercept', 'disable'],
    summary: 'Disable request interception',
    usage: 'openkodo intercept disable [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree']
  },
  {
    path: ['intercept', 'list'],
    summary: 'List paused (intercepted) requests',
    usage: 'openkodo intercept list [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree']
  },
  {
    path: ['capture', 'start'],
    summary: 'Start capturing console and network events',
    usage: 'openkodo capture start [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree']
  },
  {
    path: ['capture', 'stop'],
    summary: 'Stop capturing console and network events',
    usage: 'openkodo capture stop [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree']
  },
  {
    path: ['console'],
    summary: 'Show captured console log entries',
    usage: 'openkodo console [--limit <n>] [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'limit', 'worktree']
  },
  {
    path: ['network'],
    summary: 'Show captured network requests',
    usage: 'openkodo network [--limit <n>] [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'limit', 'worktree']
  },
  {
    path: ['dblclick'],
    summary: 'Double-click element by ref',
    usage: 'openkodo dblclick --element <ref> [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'element', 'worktree']
  },
  {
    path: ['forward'],
    summary: 'Navigate forward in browser history',
    usage: 'openkodo forward [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree']
  },
  {
    path: ['scrollintoview'],
    summary: 'Scroll element into view',
    usage: 'openkodo scrollintoview --element <ref> [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'element', 'worktree']
  },
  {
    path: ['get'],
    summary: 'Get element property (text, html, value, url, title, count, box)',
    usage: 'openkodo get --what <property> [--element <ref>] [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'what', 'element', 'worktree']
  },
  {
    path: ['is'],
    summary: 'Check element state (visible, enabled, checked)',
    usage: 'openkodo is --what <state> --element <ref> [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'what', 'element', 'worktree']
  },
  {
    path: ['inserttext'],
    summary: 'Insert text without key events',
    usage: 'openkodo inserttext --text <text> [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'text', 'worktree']
  },
  {
    path: ['mouse', 'move'],
    summary: 'Move mouse to x,y coordinates',
    usage: 'openkodo mouse move --x <n> --y <n> [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'x', 'y', 'worktree']
  },
  {
    path: ['mouse', 'down'],
    summary: 'Press mouse button',
    usage: 'openkodo mouse down [--button <left|right|middle>] [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'button', 'worktree']
  },
  {
    path: ['mouse', 'up'],
    summary: 'Release mouse button',
    usage: 'openkodo mouse up [--button <left|right|middle>] [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'button', 'worktree']
  },
  {
    path: ['mouse', 'wheel'],
    summary: 'Scroll wheel',
    usage: 'openkodo mouse wheel --dy <n> [--dx <n>] [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'dy', 'dx', 'worktree']
  },
  {
    path: ['find'],
    summary: 'Find element by semantic locator and perform action',
    usage:
      'openkodo find --locator <type> --value <text> --action <action> [--text <text>] [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'locator', 'value', 'action', 'text', 'worktree']
  },
  {
    path: ['set', 'device'],
    summary: 'Emulate a device',
    usage: 'openkodo set device --name <device> [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'name', 'worktree']
  },
  {
    path: ['set', 'offline'],
    summary: 'Toggle offline mode',
    usage: 'openkodo set offline [--state <on|off>] [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'state', 'worktree']
  },
  {
    path: ['set', 'headers'],
    summary: 'Set extra HTTP headers',
    usage: 'openkodo set headers --headers <json> [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'headers', 'worktree']
  },
  {
    path: ['set', 'credentials'],
    summary: 'Set HTTP auth credentials',
    usage: 'openkodo set credentials --user <user> --pass <pass> [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'user', 'pass', 'worktree']
  },
  {
    path: ['set', 'media'],
    summary:
      'Set color scheme and reduced motion preferences (omitted ones reset to no preference)',
    usage:
      'openkodo set media [--color-scheme <dark|light>] [--reduced-motion <reduce|no-preference>] [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'color-scheme', 'reduced-motion', 'worktree']
  },
  {
    path: ['clipboard', 'read'],
    summary: 'Read clipboard contents',
    usage: 'openkodo clipboard read [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree']
  },
  {
    path: ['clipboard', 'write'],
    summary: 'Write text to clipboard',
    usage: 'openkodo clipboard write --text <text> [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'text', 'worktree']
  },
  {
    path: ['dialog', 'accept'],
    summary: 'Accept a browser dialog',
    usage: 'openkodo dialog accept [--text <text>] [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'text', 'worktree']
  },
  {
    path: ['dialog', 'dismiss'],
    summary: 'Dismiss a browser dialog',
    usage: 'openkodo dialog dismiss [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree']
  },
  {
    path: ['storage', 'local', 'get'],
    summary: 'Get a localStorage value by key',
    usage: 'openkodo storage local get --key <key> [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'key', 'worktree']
  },
  {
    path: ['storage', 'local', 'set'],
    summary: 'Set a localStorage value',
    usage:
      'openkodo storage local set --key <key> --value <value> [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'key', 'value', 'worktree']
  },
  {
    path: ['storage', 'local', 'clear'],
    destructive: true,
    summary: 'Clear all localStorage',
    usage: 'openkodo storage local clear [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree']
  },
  {
    path: ['storage', 'session', 'get'],
    summary: 'Get a sessionStorage value by key',
    usage: 'openkodo storage session get --key <key> [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'key', 'worktree']
  },
  {
    path: ['storage', 'session', 'set'],
    summary: 'Set a sessionStorage value',
    usage:
      'openkodo storage session set --key <key> --value <value> [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'key', 'value', 'worktree']
  },
  {
    path: ['storage', 'session', 'clear'],
    destructive: true,
    summary: 'Clear all sessionStorage',
    usage: 'openkodo storage session clear [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree']
  },
  {
    path: ['download'],
    summary: 'Download a file by clicking a selector',
    usage: 'openkodo download --selector <ref> --path <path> [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'selector', 'path', 'worktree']
  },
  {
    path: ['highlight'],
    summary: 'Highlight an element by selector',
    usage: 'openkodo highlight --selector <ref> [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'selector', 'worktree']
  }
])
