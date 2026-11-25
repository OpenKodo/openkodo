# Using OpenKodo with this build

## Endpoints

| Protocol | Base URL |
| --- | --- |
| OpenAI Chat Completions | `https://api.openkodo.dev/v1` |
| OpenAI Responses (Codex) | `https://api.openkodo.dev/v1` |
| Anthropic Messages | `https://api.openkodo.dev` |

All three use the same key, created in **Console → API keys**. Keys start with
`ok_live_`.

## Plan limits

| Plan | 5h | 7d | Monthly |
| --- | --- | --- | --- |
| Go | $25 | $50 | $100 |
| Pro | $50 | $100 | $200 |
| No plan | $2 welcome-credit throttle per 5h | — | $10 total |

The windows are rolling and enforced by the gateway. The 5h and 7d numbers are
the same values the console and the Magpie plugin show.

Accounts without a plan can only call `deepseek-v4.1-flash-1017` and
`deepseek-v4.1-flash-economy`.

## Codex

```toml
model = "deepseek-v4-pro-0813"
model_provider = "openkodo"

[model_providers.openkodo]
name = "OpenKodo"
base_url = "https://api.openkodo.dev/v1"
env_key = "OPENKODO_API_KEY"
wire_api = "responses"
```

## OpenCode / Magpie

Install the OpenKodo provider plugin:

```bash
pnpm add openkodo
```

The plugin validates the key against `https://api.openkodo.dev/api/plugin/usage`
and reads the live model catalog. Provider id: `openkodo`.

## Not yet built into this fork

- In-app browser sign-in and automatic key creation
- A quota strip inside the IDE
- Plan-aware model presets
