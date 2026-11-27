# Hive

A Claude Code plugin that splits the work between models to save tokens, with a live side pane.

- **Opus** (your main chat) plans, decides and reviews.
- **Haiku** (`hive:runner`) runs commands, tests, builds and searches.
- **Sonnet** (`hive:worker`) handles multi-step chores that need judgement.
- **Codex** (OpenAI) writes and fixes code, and reviews diffs read-only, through the `mcp__hive__codex` tool.

The **Hive** pane shows the plan, which model works on what right now, Codex's files and commands, tokens per model, and your Claude 5-hour and weekly limits. It opens by itself when the plan is set. `/hive-pane` opens it by hand. It also shows local Coding Delegator jobs (Ollama) under "Local".

To hand a step to the local model call MCP tool `mcp__coding-delegator__delegate_coding` (Aider; pick `model`: qwen3:14b default, deepseek-coder-v2:16b, or gpt-oss:20b, the fastest), then `review_changes`, copy the wanted changes, `cleanup_job`. Good for small scoped edits, free and private, slower (~10-60 s per edit).

When Claude's 5-hour or weekly limit reaches 95%, Hive writes a HANDOFF.md handoff in the project root (goal, done, numbered next steps, decisions, verify commands, open questions) so Codex or Muse can continue. Set `HIVE_HANDOFF_PCT` to change the threshold. Works whether or not the pane is open.

## Use
Type `/hive` in any chat, then say what you want built.

## Needs
- `codex` CLI logged in with ChatGPT, on PATH. No API keys.
- Optional env (in `~/.claude/settings.json` under `env`): `HIVE_CODEX_MODEL`, `HIVE_CODEX_PROVIDER` (for example `openai` when your Codex config points at another provider), `HIVE_CODEX_EFFORT` (default `medium`).
- Haiku and Sonnet agents run with `effort: medium`.

Token and cost figures are client-side estimates, not your bill.
