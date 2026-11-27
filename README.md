# Hive

**One model conducts. The rest play.** A Claude Code plugin that saves your Claude tokens by splitting the work between models, with a live progress pane beside the chat.

| Who | Does |
| --- | --- |
| Opus (your main chat) | plans, decides, reviews |
| Haiku (`hive:runner`) | commands, tests, builds, searches |
| Sonnet (`hive:worker`) | multi-step chores that need judgement |
| Codex (OpenAI) | writes and fixes code, reviews diffs read-only |
| Muse Code (Meta, `mcp__hive__muse`) | implements on independent files in parallel with Codex, takes over when Codex is out of quota, and cross-reviews Codex changes |

Workers default to **medium** effort. The Haiku and Sonnet agents set `effort: medium`, and Codex and Muse have environment overrides. Use `effort: "low"` for mechanical Muse edits. For the main chat, set `"effortLevel": "medium"` in `~/.claude/settings.json`.

For cross-review, use Muse in `mode: "review"` for Codex changes and give Muse changes to Codex in a review-only task with `files: []`.

The **Hive** pane shows, live:
- the plan, each step's owner and timer, overall percent and elapsed time;
- who is working now: Codex's file and command, files written of planned, each Claude subagent's model, task and tokens;
- this task's Claude 5-hour and weekly limit before and after, and tokens per model;
- session tokens per model and your current limits.

## Install

```
/plugin marketplace add moramadan91/baton
/plugin install hive@hive
```

Then type `/hive` in any chat and say what you want built. `/hive-pane` reopens the pane.

Or drop [`Hive-Start.md`](Hive-Start.md) into any chat: Claude installs Hive if it is missing, checks Codex, and turns Hive on.

## Needs
- [Codex CLI](https://github.com/openai/codex) logged in with ChatGPT, on your PATH. No API keys.
- Optional Muse Code CLI logged in with your Meta account. Hive uses `~/.local/bin/muse` unless `HIVE_MUSE_BIN` is set. `HIVE_MUSE_MODEL` and `HIVE_MUSE_EFFORT` set the model and default effort.
- A Claude Code build that loads plugin hooks modules (the pane and the Codex tool).

Optional, in `~/.claude/settings.json` under `env`:
- `HIVE_CODEX_MODEL`: the Codex model to use.
- `HIVE_CODEX_PROVIDER`: for example `openai` when your Codex config points at another provider.
- `HIVE_CODEX_EFFORT`: reasoning effort, default `medium`.

## Mac launcher
`plugins/hive/bin/Hive.command`: double-click, pick a project folder, and Claude Code opens there with Hive on.

Token and cost figures are client-side estimates, not your bill.

## License
MIT
