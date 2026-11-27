export type Owner = 'opus' | 'sonnet' | 'haiku' | 'codex' | 'muse'
export type StepStatus = 'todo' | 'running' | 'done' | 'failed' | 'skipped'
export type PlanStep = { title: string; owner: Owner; status: StepStatus; note?: string; startedAt?: number; endedAt?: number }
// one external worker run started through the hive tools
export type Ext = {
  id: string; who: 'codex' | 'muse'; step?: number; task: string; startedAt: number; endedAt?: number; ok?: boolean
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
  // local Coding Delegator jobs and Ollama status; optional so old atoms still fit
  local?: { id: string; status: string; worker: string; model: string; project: string; startedAt: number; dur?: number; files: number; oos: number; reviewed: boolean; cleaned: boolean }[]
  ollama?: { up: boolean; loaded: string[] }
}

declare module 'claude-code' {
  interface PluginState {
    hive: { run: Shaped<Run>; tick: number }
  }
}
