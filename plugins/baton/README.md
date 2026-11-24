# Baton

A Claude Code plugin that splits the work between models to save tokens, with a live side pane.

- **Opus** (your main chat) plans, decides and reviews.
- **Haiku** (`baton:runner`) runs commands, tests, builds and searches.
- **Sonnet** (`baton:worker`) handles multi-step chores that need judgement.
- **Codex** (OpenAI) writes and fixes code, through the `mcp__baton__codex` tool.
- **Gemini** (Google) reviews read-only, through the `mcp__baton__gemini` tool.

The **Baton** pane shows the plan, which model works on what right now, Codex's files and commands, Gemini's reads, tokens per model, and your Claude 5-hour and weekly limits. It opens by itself when the plan is set. `/baton-pane` opens it by hand.

## Use
Type `/baton` in any chat, then say what you want built.

## Needs
- `codex` CLI logged in with ChatGPT, and `gemini` CLI logged in with Google, both on PATH. No API keys.
- Optional env (in `~/.claude/settings.json` under `env`): `BATON_CODEX_MODEL`, `BATON_CODEX_PROVIDER` (for example `openai` when your Codex config points at another provider), `BATON_CODEX_EFFORT` (default `medium`).

Token and cost figures are client-side estimates, not your bill.
