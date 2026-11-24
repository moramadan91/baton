# Baton

**One model conducts. The rest play.** A Claude Code plugin that saves your Claude tokens by splitting the work between models, with a live progress pane beside the chat.

| Who | Does |
| --- | --- |
| Opus (your main chat) | plans, decides, reviews |
| Haiku (`baton:runner`) | commands, tests, builds, searches |
| Sonnet (`baton:worker`) | multi-step chores that need judgement |
| Codex (OpenAI) | writes and fixes code |
| Gemini (Google) | read-only review |

The **Baton** pane shows, live:
- the plan, each step's owner and timer, overall percent and elapsed time;
- who is working now: Codex's file and command, files written of planned, Gemini's reads, each Claude subagent's model, task and tokens;
- this task's Claude 5-hour and weekly limit before and after, and tokens per model;
- session tokens per model and your current limits.

## Install

```
/plugin marketplace add moramadan91/baton
/plugin install baton@baton
```

Then type `/baton` in any chat and say what you want built. `/baton-pane` reopens the pane.

Or drop [`Baton-Start.md`](Baton-Start.md) into any chat: Claude installs Baton if it is missing, checks Codex and Gemini, and turns Baton on.

## Needs
- [Codex CLI](https://github.com/openai/codex) logged in with ChatGPT, and [Gemini CLI](https://github.com/google-gemini/gemini-cli) logged in with Google, both on your PATH. No API keys.
- A Claude Code build that loads plugin hooks modules (the pane and the Codex/Gemini tools).

Optional, in `~/.claude/settings.json` under `env`:
- `BATON_CODEX_MODEL`: the Codex model to use.
- `BATON_CODEX_PROVIDER`: for example `openai` when your Codex config points at another provider.
- `BATON_CODEX_EFFORT`: reasoning effort, default `medium`.

## Mac launcher
`plugins/baton/bin/Baton.command`: double-click, pick a project folder, and Claude Code opens there with Baton on.

Token and cost figures are client-side estimates, not your bill.

## License
MIT
