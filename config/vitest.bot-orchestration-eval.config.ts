import { defineConfig } from 'vitest/config'

// Real agent CLIs as bots; never part of the unit run. Knobs: OPENKODO_BOT_EVAL_AGENT (claude|codex),
// OPENKODO_BOT_EVAL_RUNS, OPENKODO_BOT_EVAL_CONCURRENCY, OPENKODO_BOT_EVAL_ONLY (scenario ids),
// OPENKODO_BOT_EVAL_OUT (report file; transcripts beside it), OPENKODO_BOT_EVAL_MIN_PASS_RATE,
// OPENKODO_BOT_EVAL_OPENKODO_CHECKOUT (required: a clean openkodo checkout bots may read; edits to it fail the thread),
// OPENKODO_BOT_EVAL_MODEL (pins the agent's model; the report names it and the CLI version).
// Needs zsh as the login shell, as the automation eval does.
export default defineConfig({
  test: {
    include: ['src/cli/bot-orchestration-eval/*.eval.ts'],
    environment: 'node',
    fileParallelism: false,
    // One zone for the grader, the stand-in and the agents, so schedules read the same everywhere.
    env: { TZ: 'America/New_York' },
    retry: 0
  }
})
