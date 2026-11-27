import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Ext, Owner, PlanStep, Run, StepStatus, Sub, Use } from '../types'

const PANE = 'baton'
const TITLE = 'Baton'
const zero = (): Use => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })
const fresh: Run = { on: false, title: '', startedAt: 0, steps: [], ext: [], subs: [], main: { ...zero(), turns: 0, model: '' }, byModel: {}, limits: [], at: 0, limits0: [], base: {} }
const run = atom({ plugin: 'baton', key: 'run' } as const, fresh, { shape: 'run-2' })
const tick = atom({ plugin: 'baton', key: 'tick' } as const, 0)

const EXTERNAL = ['codex', 'gemini', 'muse'] as const
const OWNERS: Owner[] = ['opus', 'sonnet', 'haiku', ...EXTERNAL]
const mainUse: Record<string, Use> = {} // main thread, per model
const agentUse = new Map<string, { model: string; u: Use }[]>() // subagent id -> its usage, kept after it ends
const stepOf = new Map<string, number>() // subagent id -> plan step (from "S3 ..." in its description)
const locks = new Set<string>()
const handedOff = new Set<string>()
let lastLocal = 0, lastOl = 0 // local jobs refresh <= every 4 s, Ollama <= every 10 s

const fam = (m = '') => (/muse/i.test(m) ? 'Muse' : /opus/i.test(m) ? 'Opus' : /sonnet/i.test(m) ? 'Sonnet' : /haiku/i.test(m) ? 'Haiku' : /gpt|codex|o\d/i.test(m) ? 'Codex' : m || '?')
const ownerName = (o: Owner) => o[0]!.toUpperCase() + o.slice(1)
const add = (a: Use, u: any) => ({ input: a.input + (u.input_tokens || 0), output: a.output + (u.output_tokens || 0), cacheRead: a.cacheRead + (u.cache_read_input_tokens || u.cached_input_tokens || u.cached || 0), cacheWrite: a.cacheWrite + (u.cache_creation_input_tokens || 0) })
const k = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : String(n))
const clock = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)), m = Math.floor(s / 60); return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}` }
const hhmm = (iso?: string) => { if (!iso) return ''; const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
const short = (s: string, n = 48) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t }
const base = (p: string) => p.split('/').pop() || p
const bar = (pct: number, w: number) => { const f = Math.round((Math.max(0, Math.min(100, pct)) / 100) * w); return ['█'.repeat(f), '░'.repeat(w - f)] as const }

async function setStep($: EngineInterface, i: number | undefined, status: StepStatus, note?: string) {
  if (!i) return
  await update($, run, r => ({
    ...r,
    steps: r.steps.map((s, j) => (j !== i - 1 ? s : {
      ...s, status, note: note ?? s.note,
      startedAt: status === 'running' ? s.startedAt ?? Date.now() : s.startedAt,
      endedAt: status === 'done' || status === 'failed' || status === 'skipped' ? Date.now() : undefined,
    })),
  }))
  const r = await read($, run)
  const fin = (s: PlanStep) => s.status === 'done' || s.status === 'failed' || s.status === 'skipped'
  if (r.steps.length && !r.endedAt && r.steps.every(fin)) {
    await poll($, true)
    await update($, run, x => ({ ...x, endedAt: Date.now(), limits1: x.limits, cost1: x.costUsd }))
  }
}

const sub = (a: Use, b?: Use): Use => ({ input: a.input - (b?.input ?? 0), output: a.output - (b?.output ?? 0), cacheRead: a.cacheRead - (b?.cacheRead ?? 0), cacheWrite: a.cacheWrite - (b?.cacheWrite ?? 0) })
const limName = (kind: string) => (kind === 'five_hour' ? '5-hour' : kind === 'seven_day' ? 'weekly' : kind)
// what this task cost: limits before and now/after, tokens per model since the plan was set
function taskReport(r: Run) {
  const used = Object.entries(r.byModel).map(([m, u]) => [m, sub(u, r.base[m])] as const).filter(([, u]) => u.input + u.output + u.cacheRead + u.cacheWrite > 0)
  const ext = EXTERNAL.map(w => [ownerName(w), r.ext.filter(x => x.who === w).reduce((a, x) => ({ i: a.i + x.tokensIn, o: a.o + x.tokensOut }), { i: 0, o: 0 })] as const).filter(([, t]) => t.i + t.o > 0)
  const after = r.limits1 ?? r.limits
  const limits = after.map(l => { const b = r.limits0.find(x => x.kind === l.kind); return { name: limName(l.kind), from: b?.pct, to: l.pct, delta: b ? Math.round((l.pct - b.pct) * 10) / 10 : undefined, resetsAt: l.resetsAt } })
  const cost = r.cost1 ?? r.costUsd, cost0 = r.cost0
  return { used, ext, limits, cost: cost !== undefined && cost0 !== undefined ? cost - cost0 : undefined }
}
function reportText(r: Run) {
  const t = taskReport(r), took = clock((r.endedAt ?? Date.now()) - r.startedAt)
  return [
    `Baton task "${r.title}" ${r.endedAt ? 'finished' : 'so far'} in ${took}.`,
    ...t.limits.map(l => `Claude ${l.name} limit: ${l.from ?? '?'}% -> ${l.to}% (${l.delta !== undefined ? `${l.delta >= 0 ? '+' : ''}${l.delta}%` : 'no reading before'})${l.resetsAt ? `, resets ${hhmm(l.resetsAt)}` : ''}`),
    ...t.used.map(([m, u]) => `${m}: ${k(u.input + u.cacheWrite)} in, ${k(u.cacheRead)} cached, ${k(u.output)} out`),
    ...t.ext.map(([m, x]) => `${m}: ${k(x.i)} in, ${k(x.o)} out (its own plan)`),
    ...(t.cost !== undefined ? [`Claude cost this task ~$${t.cost.toFixed(2)} (estimate)`] : []),
  ].join('\n')
}

async function patchExt($: EngineInterface, id: string, f: (x: Ext) => Partial<Ext>) {
  await update($, run, r => ({ ...r, ext: r.ext.map(x => (x.id === id ? { ...x, ...f(x) } : x)) }))
}

async function startExt($: EngineInterface, who: Ext['who'], a: any) {
  const id = `${who}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const x: Ext = { id, who, step: a.step, task: short(String(a.task || ''), 80), startedAt: Date.now(), now: 'starting', files: [], planned: a.files || [], cmds: 0, tools: 0, tokensIn: 0, tokensOut: 0 }
  await update($, run, r => ({ ...r, on: true, ext: [...r.ext.slice(-7), x] }))
  void $.ui.open({ id: PANE, title: TITLE })
  await setStep($, a.step, 'running')
  return id
}

// Codex writes code: one `codex exec --json` run, its events streamed into the pane.
async function runCodex($: EngineInterface, a: any) {
  const cwd = String(a.cwd || '')
  if (!cwd.startsWith('/')) return { result: 'cwd must be the absolute project path.' }
  const files: string[] = (a.files || []).map((f: string) => (f.startsWith('/') ? f : `${cwd.replace(/\/$/, '')}/${f}`))
  const home = (await $.env.get('HOME')) || '/tmp'
  const lockDir = `${home}/.claude/baton/locks`
  const held: string[] = []
  await $.process.run(['mkdir', '-p', lockDir])
  for (const f of files) {
    const l = `${lockDir}/${f.replace(/[^a-zA-Z0-9]+/g, '_').slice(-120)}`
    if (locks.has(f) || (await $.process.run(['mkdir', l])).exitCode !== 0) {
      for (const acquired of files.slice(0, held.length)) locks.delete(acquired)
      for (const h of held) await $.process.run(['rmdir', h])
      return { result: `LOCKED: ${f} is being written by another worker. Wait for it or pick other files.` }
    }
    locks.add(f); held.push(l)
  }
  const id = await startExt($, 'codex', a)
  const model = await $.env.get('BATON_CODEX_MODEL'), provider = await $.env.get('BATON_CODEX_PROVIDER')
  const effort = (await $.env.get('BATON_CODEX_EFFORT')) || 'medium'
  const argv = ['codex', 'exec', '--json', '--skip-git-repo-check', '-s', 'workspace-write', '-C', cwd,
    ...(provider ? ['-c', `model_provider="${provider}"`] : []), ...(model ? ['-m', model] : []), '-c', `model_reasoning_effort=${effort}`, String(a.task)]
  let buf = '', err = '', last = '', changed = new Set<string>(), code: number | null = null
  try {
    const p = $.process.spawn({ argv, cwd, input: '' })
    while (true) {
      const n = await p.next()
      if (n.done) { code = n.value.code; break }
      if (n.value.stream === 'stderr') { err = (err + n.value.text).slice(-3000); continue }
      buf += n.value.text
      const lines = buf.split('\n'); buf = lines.pop() || ''
      for (const line of lines) {
        let ev: any; try { ev = JSON.parse(line) } catch { continue }
        const it = ev.item || {}
        if (ev.type === 'item.started' && it.type === 'command_execution') await patchExt($, id, () => ({ now: `running ${short(String(it.command).replace(/^\/bin\/\w+ -lc /, ''), 40)}` }))
        else if (ev.type === 'item.completed' && it.type === 'command_execution') await patchExt($, id, x => ({ cmds: x.cmds + 1 }))
        else if (it.type === 'file_change') {
          for (const c of it.changes || []) if (c.path) changed.add(c.path)
          const names = [...changed]
          await patchExt($, id, () => ({ files: names, now: `editing ${base(names[names.length - 1] || '')}` }))
        } else if (ev.type === 'item.completed' && it.type === 'agent_message') { last = String(it.text || ''); await patchExt($, id, () => ({ now: short(last, 50) })) }
        else if (ev.type === 'turn.completed' && ev.usage) await patchExt($, id, x => ({ tokensIn: x.tokensIn + (ev.usage.input_tokens || 0), tokensOut: x.tokensOut + (ev.usage.output_tokens || 0) + (ev.usage.reasoning_output_tokens || 0), model: model || 'codex' }))
      }
    }
  } catch (e: any) { err += `\n${e?.message || e}` }
  finally {
    for (const f of files) locks.delete(f)
    for (const h of held) await $.process.run(['rmdir', h])
  }
  const ok = code === 0
  await patchExt($, id, () => ({ endedAt: Date.now(), ok, now: ok ? 'finished' : `failed (exit ${code})` }))
  await setStep($, a.step, ok ? 'done' : 'failed')
  const x = (await read($, run)).ext.find(e => e.id === id)
  return { result: [
    ok ? 'Codex finished.' : `Codex FAILED (exit ${code}). stderr tail:\n${err.slice(-1200)}`,
    `Files changed: ${[...changed].join(', ') || 'none reported'}`,
    `Tokens: ${x?.tokensIn ?? 0} in / ${x?.tokensOut ?? 0} out`,
    'Report:', last || '(no final message)',
  ].join('\n') }
}

// Muse writes code or reviews read-only, streaming its JSONL events into the pane.
async function runMuse($: EngineInterface, a: any) {
  const cwd = String(a.cwd || ''), readonly = a.mode === 'review'
  if (!cwd.startsWith('/')) return { result: 'cwd must be the absolute project path.' }
  if (!readonly && !Array.isArray(a.files)) return { result: 'files must be provided in write mode.' }
  const files: string[] = readonly ? [] : a.files.map((f: string) => (f.startsWith('/') ? f : `${cwd.replace(/\/$/, '')}/${f}`))
  const home = (await $.env.get('HOME')) || '/tmp', lockDir = `${home}/.claude/baton/locks`
  const bin = (await $.env.get('BATON_MUSE_BIN')) || `${home}/.local/bin/muse`
  const effort = a.effort || (await $.env.get('BATON_MUSE_EFFORT')) || 'medium', model = await $.env.get('BATON_MUSE_MODEL')
  const argv = [bin, 'exec', '--json', '--workspace', cwd, '--no-foreign-personal-context', '--disable-approval', '--contributor-mode', 'off', '--reasoning-effort', effort,
    ...(model ? ['--model', model] : []), ...(readonly ? ['--disable-write', '--disable-shell'] : []), String(a.task)]
  const held = new Map<string, string>(), changed = new Set<string>()
  let id: string, buf = '', err = '', text = '', last = '', failure = '', code: number | null = null
  try {
    if (files.length) await $.process.run(['mkdir', '-p', lockDir])
    for (const f of files) {
      const l = `${lockDir}/${f.replace(/[^a-zA-Z0-9]+/g, '_').slice(-120)}`
      if (locks.has(f) || (await $.process.run(['mkdir', l])).exitCode !== 0) return { result: `LOCKED: ${f} is being written by another worker. Wait for it or pick other files.` }
      locks.add(f); held.set(f, l)
    }
    id = await startExt($, 'muse', readonly ? { ...a, files } : a)
    try {
      const p = $.process.spawn({ argv, cwd, input: '' })
      while (true) {
        const n = await p.next()
        if (n.done) buf += '\n'
        else if (n.value.stream === 'stderr') { err = (err + n.value.text).slice(-3000); continue }
        else buf += n.value.text
        const lines = buf.split('\n'); buf = lines.pop() || ''
        for (const line of lines) {
          let ev: any; try { ev = JSON.parse(line) } catch { continue }
          const type = ev?.payload_type, payload = ev?.payload || {}
          if (type === 'run.output.delta') { text += payload.text || ''; await patchExt($, id, () => ({ now: short(text.slice(-50), 50) })) }
          else if (typeof type === 'string' && type.includes('tool')) {
            const path = [payload.edit_facts?.path, payload.path, payload.file_path].find(v => typeof v === 'string')
            if (typeof path === 'string') changed.add(path)
            await patchExt($, id, () => ({ now: short(`${payload.edit_facts?.tool_name || payload.name || payload.tool_name || type}`, 40), files: [...changed] }))
          } else if (type === 'run.usage') {
            const models = payload.models || []
            await patchExt($, id, x => ({ tokensIn: models.reduce((n: number, m: any) => n + (m.input_tokens || 0), x.tokensIn), tokensOut: models.reduce((n: number, m: any) => n + (m.output_tokens || 0) + (m.reasoning_tokens || 0), x.tokensOut), model: models[0]?.model || 'muse' }))
          } else if (type === 'run.terminal.completed') {
            last = payload.text || text
            if (payload.terminal !== 'completed') failure = String(payload.reason || payload.terminal || 'unknown terminal status')
          }
        }
        if (n.done) { code = n.value.code; break }
      }
    } catch (e: any) { err += `\n${e?.message || e}` }
  } finally {
    for (const [f, l] of held) { locks.delete(f); await $.process.run(['rmdir', l]) }
  }
  const ok = code === 0 && !failure
  await patchExt($, id, () => ({ endedAt: Date.now(), ok, now: ok ? 'finished' : failure ? `failed (${short(failure, 40)})` : `failed (exit ${code})` }))
  await setStep($, a.step, ok ? 'done' : 'failed')
  const x = (await read($, run)).ext.find(e => e.id === id)
  return { result: [
    ok ? 'Muse finished.' : `Muse FAILED (exit ${code})${failure ? `: ${failure}` : ''}. stderr tail:\n${err.slice(-1200)}`,
    `Files changed: ${[...changed].join(', ') || 'none reported'}`,
    `Tokens: ${x?.tokensIn ?? 0} in / ${x?.tokensOut ?? 0} out`,
    'Report:', last || text || '(no final message)',
  ].join('\n') }
}

// Gemini reviews/plans read-only: one headless `gemini --approval-mode plan` run on the user's Google login.
async function runGemini($: EngineInterface, a: any) {
  const cwd = String(a.cwd || '')
  if (!cwd.startsWith('/')) return { result: 'cwd must be the absolute project path.' }
  const id = await startExt($, 'gemini', { ...a, files: [] })
  await patchExt($, id, () => ({ now: 'thinking', model: 'gemini' }))
  const argv = ['env', '-u', 'GEMINI_API_KEY', '-u', 'GOOGLE_API_KEY', 'GEMINI_CLI_TRUST_WORKSPACE=true',
    'gemini', '--approval-mode', 'plan', '-p', String(a.task)]
  let out = '', err = '', code: number | null = null
  try {
    const p = $.process.spawn({ argv, cwd, input: '' })
    while (true) {
      const n = await p.next()
      if (n.done) { code = n.value.code; break }
      if (n.value.stream === 'stderr') err = (err + n.value.text).slice(-3000)
      else out += n.value.text
    }
  } catch (e: any) { err += `\n${e?.message || e}` }
  const ok = code === 0
  await patchExt($, id, () => ({ endedAt: Date.now(), ok, now: ok ? 'finished' : `failed (exit ${code})` }))
  await setStep($, a.step, ok ? 'done' : 'failed')
  return { result: ok ? `Gemini finished.\nReport:\n${out.trim() || '(empty)'}` : `Gemini FAILED (exit ${code}). stderr tail:\n${err.slice(-1200)}` }
}

// Subagents, usage and limits: read every 2 s while Baton is on.
async function poll($: EngineInterface, withUsage: boolean) {
  const agents = await $.agent.list()
  const subs: Sub[] = []
  for (const g of agents) {
    if (g.kind !== 'local_agent') continue
    if (g.usage?.length) agentUse.set(g.id, g.usage.map(u => ({ model: u.model, u: add(zero(), u) })))
    const out = (g.usage || []).reduce((n, u) => n + u.output_tokens, 0)
    const done = g.taskStatus !== 'running' && g.taskStatus !== 'pending'
    subs.push({ id: g.id, type: g.type, model: fam(g.model), label: short(g.label.split('\n').pop() || g.description, 60), status: g.status, startedAt: g.startTime, endedAt: done ? Date.now() : undefined, tokens: g.tokenCount, out, step: stepOf.get(g.id) })
  }
  const byModel: Record<string, Use> = {}
  const merge = (m: string, u: Use) => { const f = fam(m), b = byModel[f] ?? zero(); byModel[f] = { input: b.input + u.input, output: b.output + u.output, cacheRead: b.cacheRead + u.cacheRead, cacheWrite: b.cacheWrite + u.cacheWrite } }
  for (const [m, u] of Object.entries(mainUse)) merge(m, u)
  for (const list of agentUse.values()) for (const { model, u } of list) merge(model, u)
  const usage = withUsage ? await $.session.usage() : undefined
  const t0 = Date.now()
  let lj: Run['local'], ol: Run['ollama']
  if (t0 - lastLocal >= 4000) {
    lastLocal = t0
    try {
      const dir = `${(await $.env.get('HOME')) || '/tmp'}/.local/state/coding-delegator/jobs`
      const top = (await $.fs.list(dir)).filter(e => e.name.endsWith('.json')).sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, 5)
      const out: NonNullable<Run['local']> = []
      for (const e of top) {
        try {
          const j = JSON.parse(await $.fs.read(`${dir}/${e.name}`))
          out.push({ id: String(j.job_id), status: String(j.status), worker: String(j.worker), model: String(j.model || ''), project: base(String(j.project_root || '')), startedAt: Number(j.created_at) * 1000, ...(j.duration_seconds != null ? { dur: Number(j.duration_seconds) } : {}), files: (j.changed_files || []).length, oos: (j.out_of_scope || []).length, reviewed: !!j.reviewed, cleaned: !!j.cleaned })
        } catch {}
      }
      lj = out
    } catch { lj = [] }
  }
  if (t0 - lastOl >= 10000) {
    lastOl = t0
    try {
      const ps = await $.process.run(['curl', '-fsS', '-m', '1', 'http://127.0.0.1:11434/api/ps'])
      const ms = ps.exitCode === 0 ? JSON.parse(ps.stdout).models : null
      ol = { up: ps.exitCode === 0, loaded: Array.isArray(ms) ? ms.map((m: any) => String(m.name || m.model || '')) : [] }
    } catch { ol = { up: false, loaded: [] } }
  }
  await update($, run, r => {
    const keep = r.subs.filter(s => !subs.some(n => n.id === s.id)).map(s => (s.endedAt ? s : { ...s, endedAt: Date.now(), status: 'completed' }))
    return {
      ...r, subs: [...keep, ...subs].slice(-8), byModel, at: Date.now(),
      ...(usage ? { limits: usage.rateLimits.map(l => ({ kind: l.kind, pct: l.percentUsed, resetsAt: l.resetsAt })), costUsd: usage.cost?.usd } : {}),
      ...(lj !== undefined ? { local: lj } : {}), ...(ol !== undefined ? { ollama: ol } : {}),
    }
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'baton-pane', description: 'Show the Baton progress pane' })
    const step = { type: 'integer', description: 'The plan step this run belongs to (1-based); the pane marks it running, then done or failed.' }
    await $.tool.register({
      name: 'plan',
      description: 'Baton: set the plan shown in the live pane (replaces the current one). Each step has an owner: opus (decisions, review), sonnet (multi-step chores), haiku (commands, tests, reads), codex (writes code), gemini (read-only review), muse (writes code in parallel with codex, or reviews).',
      inputSchema: { type: 'object', required: ['title', 'steps'], properties: {
        title: { type: 'string' },
        steps: { type: 'array', items: { type: 'object', required: ['title', 'owner'], properties: { title: { type: 'string' }, owner: { type: 'string', enum: OWNERS } } } },
      } },
    })
    await $.tool.register({
      name: 'step',
      description: 'Baton: mark a plan step (1-based) running, done, failed or skipped, with an optional short note.',
      inputSchema: { type: 'object', required: ['index', 'status'], properties: { index: { type: 'integer' }, status: { type: 'string', enum: ['running', 'done', 'failed', 'skipped'] }, note: { type: 'string' } } },
    })
    await $.tool.register({
      name: 'codex',
      description: 'Baton: have Codex (OpenAI, the user\'s ChatGPT login) write or fix code. Blocks until Codex ends and returns its report, the files it changed and its tokens. The files listed are locked while it runs. Codex has no network.',
      inputSchema: { type: 'object', required: ['task', 'cwd', 'files'], properties: {
        task: { type: 'string', description: 'The full ticket: goal, files, constraints, done criteria, "report what you changed".' },
        cwd: { type: 'string', description: 'Absolute project path.' },
        files: { type: 'array', items: { type: 'string' }, description: 'Files (or folders) Codex may write, relative to cwd.' },
        step,
      } },
    })
    await $.tool.register({
      name: 'gemini',
      description: 'Baton: have Gemini (Google, the user\'s Gemini CLI login) review code, plans or diffs read-only (it edits nothing). Second opinion next to Codex. Blocks until it ends and returns its report.',
      inputSchema: { type: 'object', required: ['task', 'cwd'], properties: {
        task: { type: 'string', description: 'What to review or answer, with the files to read and what to report.' },
        cwd: { type: 'string', description: 'Absolute project path.' },
        step,
      } },
    })
    await $.tool.register({
      name: 'muse',
      description: 'Baton: have Muse Code (Meta, the user\'s Meta login) write or fix code (mode "write", default) or review read-only (mode "review"). Runs in parallel with Codex on different files. Blocks until it ends and returns its report, files changed and tokens.',
      inputSchema: { type: 'object', required: ['task', 'cwd'], properties: {
        task: { type: 'string', description: 'The full ticket or what to review.' },
        cwd: { type: 'string', description: 'Absolute project path.' },
        files: { type: 'array', items: { type: 'string' }, description: 'Files (or folders) Muse may write, relative to cwd. Required in write mode.' },
        mode: { type: 'string', enum: ['write', 'review'] },
        effort: { type: 'string', enum: ['low', 'medium', 'high'] },
        step,
      } },
    })
    let n = 0
    $.clock.every(1000, async () => {
      const r = await read($, run)
      if (!r.on) return
      await update($, tick, x => x + 1)
      if (++n % 2 === 0) await poll($, n % 20 === 0 || !r.limits.length)
    })
    return next(e)
  })

  on('command.run', { command: 'baton-pane' }, async $ => {
    await update($, run, r => ({ ...r, on: true }))
    await $.ui.open({ id: PANE, title: TITLE })
    return { text: 'Baton pane opened.' }
  })

  on('tool.run', { tool: 'mcp__baton__plan' }, async ($, e) => {
    const a = e as any
    const steps: PlanStep[] = (a.steps || []).map((s: any) => ({ title: String(s.title), owner: OWNERS.includes(s.owner) ? s.owner : 'opus', status: 'todo' }))
    await poll($, true) // fresh limits and totals: the "before" snapshot of this task
    await update($, run, r => {
      const same = r.title === a.title && r.startedAt > 0
      return { ...r, on: true, title: String(a.title || ''), steps, endedAt: undefined, limits1: undefined, cost1: undefined,
        ...(same ? {} : { startedAt: Date.now(), ext: [], limits0: r.limits, base: r.byModel, cost0: r.costUsd }) }
    })
    await $.ui.open({ id: PANE, title: TITLE })
    const r = await read($, run)
    const lim = r.limits0.map(l => `${limName(l.kind)} ${l.pct}%`).join(', ')
    return { result: `Plan set: ${steps.length} steps. Claude limits before this task: ${lim || 'no reading yet'}. Delegated steps update themselves; mark your own with mcp__baton__step. Tell the user these limits now.` }
  })
  on('tool.run', { tool: 'mcp__baton__step' }, async ($, e) => {
    const a = e as any
    await setStep($, a.index, a.status, a.note)
    const r = await read($, run)
    return { result: r.endedAt ? `All steps finished. Give the user this report:\n${reportText(r)}` : 'ok' }
  })
  on('tool.run', { tool: 'mcp__baton__codex' }, ($, e) => runCodex($, e))
  on('tool.run', { tool: 'mcp__baton__gemini' }, ($, e) => runGemini($, e))
  on('tool.run', { tool: 'mcp__baton__muse' }, ($, e) => runMuse($, e))

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    const m = /^S(\d+)\b/i.exec(e.description)
    if (r.agentId && m) { stepOf.set(r.agentId, Number(m[1])); await setStep($, Number(m[1]), 'running') }
    return r
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId) {
      const s = stepOf.get(e.agentId)
      if (s) await setStep($, s, e.reason === 'answer' ? 'done' : 'failed')
    } else if (e.usage) {
      mainUse[e.usage.model] = add(mainUse[e.usage.model] ?? zero(), e.usage)
      const u = e.usage
      await update($, run, r => ({ ...r, main: { ...add(r.main, u), turns: r.main.turns + 1, model: u.model } }))
    }
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const t = Number(await $.env.get('BATON_HANDOFF_PCT')) || 95
    for (const l of (e as any).rateLimits || []) {
      if ((l.kind !== 'five_hour' && !String(l.kind).startsWith('seven_day')) || l.percentUsed < t) continue
      const key = `${l.kind}@${l.resetsAt ?? ''}`
      if (handedOff.has(key)) continue
      handedOff.add(key)
      await $.session.append({ type: 'user', content: [{ type: 'text', text: `Baton limit guard: Claude's ${limName(l.kind)} limit is at ${l.percentUsed}%${l.resetsAt ? ` (resets ${hhmm(l.resetsAt)})` : ''}. Stop starting new work. Right now, in the current project root, write HANDOFF.md so Codex or Muse can continue without you: 1) the goal in the user's words, 2) what is done (with file paths), 3) what is left as numbered steps, each small enough for one agent run, 4) decisions made and constraints/rules to keep, 5) how to verify (commands, expected result), 6) open questions. Keep it under 150 lines. Then tell the user, in their language, that it is written and they can continue in that folder with \`muse "Read HANDOFF.md and continue from the first unfinished step"\` or \`codex "Read HANDOFF.md and continue from the first unfinished step"\`, and that you will review their work when the limit resets.` }] })
      await $.ui.toast(`Baton: Claude ${limName(l.kind)} limit at ${l.percentUsed}% - writing HANDOFF.md`)
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    await read($, tick)
    const r = await read($, run)
    const now = Date.now(), w = Math.max(10, Math.min(30, (e.viewport?.columns ?? 44) - 20))
    const done = r.steps.filter(s => s.status === 'done' || s.status === 'skipped').length
    const live = r.ext.filter(x => !x.endedAt), recent = r.ext.filter(x => x.endedAt).slice(-3)
    const subsLive = r.subs.filter(s => !s.endedAt), subsDone = r.subs.filter(s => s.endedAt).slice(-3)
    const [pf, pe] = bar(r.steps.length ? (done / r.steps.length) * 100 : 0, w)
    const icon = (s: StepStatus) => (s === 'done' ? '✓' : s === 'running' ? '▶' : s === 'failed' ? '✗' : s === 'skipped' ? '–' : '·')
    const iconColor = (s: StepStatus) => (s === 'done' ? 'success' : s === 'running' ? 'warning' : s === 'failed' ? 'error' : undefined)
    const totalTok = Object.values(r.byModel).reduce((n, u) => n + u.input + u.output + u.cacheRead + u.cacheWrite, 0)
    const models = ['Opus', 'Sonnet', 'Haiku', ...Object.keys(r.byModel).filter(m => !['Opus', 'Sonnet', 'Haiku'].includes(m))]
    const extTok = (who: Ext['who']) => r.ext.filter(x => x.who === who).reduce((a, x) => ({ i: a.i + x.tokensIn, o: a.o + x.tokensOut }), { i: 0, o: 0 })
    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text bold>Baton{r.title ? ` · ${r.title}` : ''}</Text>
          {r.startedAt > 0 && (
            <Text mono tabular>
              <Text color={r.endedAt ? 'success' : 'warning'}>⏱ {clock((r.endedAt ?? now) - r.startedAt)}</Text>
              {r.steps.length > 0 && <Text bold> {Math.round((done / r.steps.length) * 100)}%</Text>}
              <Text dimColor> {r.endedAt ? 'finished' : 'running'}</Text>
            </Text>
          )}
          {!r.on && <Text dimColor>Off. Type /baton to start.</Text>}
        </Box>

        {r.steps.length > 0 && (
          <Box flexDirection="column">
            <Text bold>Plan <Text mono tabular>{done}/{r.steps.length}</Text></Text>
            <Text mono color="success">{pf}<Text dimColor>{pe}</Text></Text>
            {r.steps.map((s, i) => (
              <Text wrap="truncate-end">
                <Text color={iconColor(s.status)}>{icon(s.status)} </Text>
                <Text dimColor mono>{i + 1} </Text>{s.title} <Text dimColor>· {ownerName(s.owner)}</Text>
                {s.startedAt && <Text dimColor mono tabular> {clock((s.endedAt ?? now) - s.startedAt)}</Text>}
              </Text>
            ))}
          </Box>
        )}

        <Box flexDirection="column">
          <Text bold>Working now</Text>
          {!live.length && !subsLive.length && <Text dimColor>nobody · Opus is thinking or waiting</Text>}
          {live.map(x => (
            <Box flexDirection="column">
              <Text wrap="truncate-end"><Text color="warning">▶ {ownerName(x.who)}</Text>{x.step ? <Text dimColor> S{x.step}</Text> : ''} <Text dimColor mono tabular>{clock(now - x.startedAt)}</Text> {x.now}</Text>
              <Text dimColor mono tabular wrap="truncate-end">
                {'  '}files {x.planned.length ? `${Math.min(x.files.length, x.planned.length)}/${x.planned.length}` : x.files.length} · {x.cmds} cmds · {k(x.tokensIn)} in / {k(x.tokensOut)} out
              </Text>
            </Box>
          ))}
          {subsLive.map(s => (
            <Text wrap="truncate-end"><Text color="warning">▶ {s.model}</Text><Text dimColor> {s.type.replace(/^baton:/, '')}{s.step ? ` S${s.step}` : ''}</Text> <Text dimColor mono tabular>{clock(now - s.startedAt)} · {k(s.tokens)}</Text> {s.label}</Text>
          ))}
        </Box>

        {(recent.length > 0 || subsDone.length > 0) && (
          <Box flexDirection="column">
            <Text bold>Just finished</Text>
            {recent.map(x => (
              <Text dimColor wrap="truncate-end"><Text color={x.ok ? 'success' : 'error'}>{x.ok ? '✓' : '✗'}</Text> {ownerName(x.who)} {clock((x.endedAt ?? now) - x.startedAt)} · {x.files.length} files · {x.task}</Text>
            ))}
            {subsDone.map(s => (
              <Text dimColor wrap="truncate-end"><Text color="success">✓</Text> {s.model} {s.type.replace(/^baton:/, '')} {clock((s.endedAt ?? now) - s.startedAt)} · {s.label}</Text>
            ))}
          </Box>
        )}

        {(r.ollama || (r.local?.length ?? 0) > 0) && (
          <Box flexDirection="column">
            <Text bold>Local (Ollama)</Text>
            {r.ollama && (
              <Text><Text color={r.ollama.up ? 'success' : 'error'}>Ollama {r.ollama.up ? 'up' : 'down'}</Text>{r.ollama.up && r.ollama.loaded.length > 0 && <Text dimColor> · {r.ollama.loaded.join(', ')} loaded</Text>}</Text>
            )}
            {(r.local ?? []).filter(x => x.status === 'running' || x.status === 'queued').map(x => (
              <Text wrap="truncate-end"><Text color="warning">▶ {x.worker[0]!.toUpperCase() + x.worker.slice(1)}</Text> <Text dimColor mono tabular>{clock(now - x.startedAt)}</Text> {x.project}</Text>
            ))}
            {(r.local ?? []).filter(x => x.status !== 'running' && x.status !== 'queued').slice(0, 3).map(x => (
              <Text dimColor wrap="truncate-end"><Text color={x.status === 'completed' ? 'success' : 'error'}>{x.status === 'completed' ? '✓' : '✗'}</Text> {x.worker[0]!.toUpperCase() + x.worker.slice(1)} {clock((x.dur ?? 0) * 1000)} · {x.files} files{x.oos ? ` · ${x.oos} out of scope` : ''} · {x.project}{!x.reviewed && !x.cleaned ? ' · needs review' : ''}</Text>
            ))}
          </Box>
        )}

        {r.startedAt > 0 && (() => {
          const t = taskReport(r)
          return (
            <Box flexDirection="column">
              <Text bold>This task <Text dimColor>{r.endedAt ? 'before → after' : 'before → now'}</Text></Text>
              {!t.limits.length && <Text dimColor>no limit reading yet</Text>}
              {t.limits.map(l => (
                <Text mono tabular>
                  {l.name.padEnd(7)}{l.from ?? '?'}% → <Text bold>{l.to}%</Text>
                  {l.delta !== undefined && <Text color={l.delta > 5 ? 'warning' : 'success'}> {l.delta >= 0 ? '+' : ''}{l.delta}%</Text>}
                </Text>
              ))}
              {t.used.map(([m, u]) => <Text mono tabular wrap="truncate-end">{m.padEnd(7)}{k(u.input + u.cacheWrite + u.cacheRead).padStart(6)} in {k(u.output).padStart(6)} out</Text>)}
              {t.ext.map(([m, x]) => <Text mono tabular>{m.padEnd(7)}{k(x.i).padStart(6)} in {k(x.o).padStart(6)} out <Text dimColor>own plan</Text></Text>)}
              {t.cost !== undefined && <Text dimColor>Claude ~${t.cost.toFixed(2)} this task (estimate)</Text>}
            </Box>
          )
        })()}

        <Box flexDirection="column">
          <Text bold>Session tokens <Text dimColor>(estimate)</Text></Text>
          {models.filter(m => r.byModel[m]).map(m => {
            const u = r.byModel[m]!, all = u.input + u.output + u.cacheRead + u.cacheWrite
            return <Text mono tabular wrap="truncate-end">{m.padEnd(7)}{k(u.input + u.cacheWrite).padStart(6)} in {k(u.cacheRead).padStart(6)} cached {k(u.output).padStart(6)} out <Text dimColor>{totalTok ? Math.round((all / totalTok) * 100) : 0}%</Text></Text>
          })}
          {EXTERNAL.map(who => { const t = extTok(who); return t.i + t.o > 0 ? <Text key={who} mono tabular>{ownerName(who).padEnd(7)}{k(t.i).padStart(6)} in {''.padStart(13)}{k(t.o).padStart(6)} out <Text dimColor>own plan</Text></Text> : null })}
          {r.costUsd !== undefined && <Text dimColor>Claude session ~${r.costUsd.toFixed(2)} (estimate, not your bill)</Text>}
        </Box>

        <Box flexDirection="column">
          <Text bold>Claude limits</Text>
          {!r.limits.length && <Text dimColor>no reading yet (comes with the next reply)</Text>}
          {r.limits.map(l => {
            const [f, e2] = bar(l.pct, w)
            return (
              <Text mono tabular wrap="truncate-end">
                {(l.kind === 'five_hour' ? '5-hour' : l.kind === 'seven_day' ? 'weekly' : l.kind).padEnd(7)}<Text color={l.pct >= 90 ? 'error' : l.pct >= 70 ? 'warning' : 'success'}>{f}</Text><Text dimColor>{e2}</Text> {l.pct}% <Text dimColor>left {Math.max(0, 100 - l.pct).toFixed(0)}%{l.resetsAt ? ` · resets ${hhmm(l.resetsAt)}` : ''}</Text>
              </Text>
            )
          })}
        </Box>
      </Box>
    )
  })
}
