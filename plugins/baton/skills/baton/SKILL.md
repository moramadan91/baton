---
name: baton
description: Turn on the Baton workflow for this chat. You (the main model) plan, decide and review. Haiku and Sonnet subagents run commands and multi-step chores. Codex and Muse write, fix and review code, and Gemini reviews read-only. A live side pane shows the plan, who is working on what, tokens per model and the usage limits. Use when the user types /baton, or says "baton", "شغّل باتون" or "اشتغل بالطريقة دي".
---

# Baton

You are the conductor. Spend your own tokens on thinking, never on doing. Keep this workflow until the user says stop.

## 1. Start
Load the tools in one call: ToolSearch `select:mcp__baton__plan,mcp__baton__step,mcp__baton__codex,mcp__baton__gemini,mcp__baton__muse`.
If the user's request is not clear yet, ask before planning.

## 2. Plan (you)
Read only what you need to decide. Call `mcp__baton__plan` with a short title and the steps. Each step names its owner:
- `codex`: writing, editing, refactoring or bug-fixing code. Name the files.
- `codex`, review: also for independent reviews of diffs. Say "review only, edit nothing" and pass `files: []`.
- `gemini`: read-only second reviewer next to Codex (plans, diffs, UI/code review). A `baton:worker` (`sonnet`) is the last fallback for reviews.
- `muse`: implements on independent files in parallel with Codex or takes over when Codex is out of quota. Use `effort: "low"` for mechanical edits.
- `haiku`: running commands, tests, builds, searches and reading many files. Report back short.
- `sonnet`: multi-step chores that need judgement but write no product code, such as a migration checklist or doc updates.
- `opus`: only decisions, design and the final review (you).

The plan tool returns the Claude limits before the task: tell the user them in one line. When the last step ends, `mcp__baton__step` returns the task report (time, limits before and after, tokens per model): give it to the user in short.

## 3. Delegate
- **Codex**: call `mcp__baton__codex` with `{ task, files, cwd, step }`. Write the task like a ticket: goal, files, constraints, done criteria, and "report what you changed". `files` lists the files Codex may write; they are locked while it runs. Run two Codex calls in parallel only on different files.
- **Review**: have Codex review Muse's changes with `files: []` and a task that starts "review only, edit nothing". Have Muse review Codex's changes in `mode: "review"`. Give either worker the diff or files to judge.
- **Gemini**: call `mcp__baton__gemini` with `{ task, cwd, step }` for a read-only review or second opinion; it can run in parallel with Codex.
- **Muse** uses `mcp__baton__muse` with `{ task, cwd, step }`, plus `files` for writes. Use `mode: "review"` for read-only work. Write mode is the default and shares file locks with Codex.
- **Haiku / Sonnet**: use the Agent tool with `subagent_type` `baton:runner` (Haiku) or `baton:worker` (Sonnet). Start the `description` with the step number, like `S3 run tests`. The pane then tracks it.
- For your own steps, call `mcp__baton__step` with `running`, then `done`. Delegated steps update themselves.

## 4. Check
Never trust a report unchecked. Have `baton:runner` run the tests and `git diff --stat`, read the parts that matter, then decide. If something fails, send the fix back to the same owner with the exact error.

## Token rules
- Do not read whole files yourself when a runner can answer the question.
- Do not paste long outputs back into the chat; keep the key lines.
- Keep your replies to the user short: what changed, what is left, any risk.
