export type Owner = 'opus' | 'sonnet' | 'haiku' | 'codex' | 'gemini'
export type StepStatus = 'todo' | 'running' | 'done' | 'failed' | 'skipped'
export type PlanStep = { title: string; owner: Owner; status: StepStatus; note?: string; startedAt?: number; endedAt?: number }
// one Codex or Gemini run started through the baton tools
export type Ext = {
  id: string; who: 'codex' | 'gemini'; step?: number; task: string; startedAt: number; endedAt?: number; ok?: boolean
  now: string; files: string[]; planned: string[]; cmds: number; tools: number; tokensIn: number; tokensOut: number; model?: string
}
// one Claude subagent, as $.agent.list reports it
export type Sub = { id: string; type: string; model: string; label: string; status: string; startedAt: number; endedAt?: number; tokens: number; out: number; step?: number }
export type Use = { input: number; output: number; cacheRead: number; cacheWrite: number }
export type Limit = { kind: string; pct: number; resetsAt?: string }
export type Run = {
  on: boolean; title: string; startedAt: number; steps: PlanStep[]; ext: Ext[]; subs: Sub[]
  main: Use & { turns: number; model: string }; byModel: Record<string, Use>; limits: Limit[]; costUsd?: number; at: number
  // this task: limits and per-model tokens when the plan was set, limits when its last step ended
  endedAt?: number; limits0: Limit[]; limits1?: Limit[]; base: Record<string, Use>; cost0?: number; cost1?: number
}

declare module 'claude-code' {
  interface PluginState {
    baton: { run: Shaped<Run>; tick: number }
  }
}
