import type { Fact, MemoryResult, MemoryResults, MemoryRowState } from '../types'
import type { RunResult } from './snapshot'

export const MEMORY_PANE = 'agentzero-memory'
export const MEMORY_TITLE = 'AgentZero · Memory'
export const MEMORY_ROW_CAP = 200

// actionable: the Fact is still in the snapshot and not on its way out, so Forget can be pressed.
export type MemoryRow = { fact: Fact; state: 'active' | MemoryRowState; message: string | null; citedBy: string[]; actionable: boolean }

function newestFirst(x: Fact, y: Fact): number {
  const tx = x.createdAt !== null ? Date.parse(x.createdAt) : NaN
  const ty = y.createdAt !== null ? Date.parse(y.createdAt) : NaN
  if (Number.isNaN(tx)) return Number.isNaN(ty) ? 0 : 1
  if (Number.isNaN(ty)) return -1
  return ty - tx
}

export function memoryRows(
  facts: readonly Fact[],
  results: MemoryResults,
): { rows: MemoryRow[]; active: number; inHotSet: number; forgotten: number; hidden: number } {
  const row = (fact: Fact, listed: boolean): MemoryRow => {
    const r = results[fact.id]
    if (r === undefined) return { fact, state: 'active', message: null, citedBy: [], actionable: listed }
    return {
      fact,
      state: r.outcome,
      message: r.outcome === 'failed' ? r.message : null,
      citedBy: r.citedBy,
      actionable: listed && r.outcome === 'failed',
    }
  }
  const rows = facts.map(f => row(f, true))
  // A Fact forgotten here, or whose forget failed, stays listed after it leaves the snapshot,
  // so the pane never hides what happened to it. A confirmation for a Fact gone elsewhere is dropped.
  const listed = new Set(facts.map(f => f.id))
  for (const r of Object.values(results)) {
    if (!listed.has(r.fact.id) && r.outcome !== 'confirming') rows.push(row(r.fact, false))
  }
  rows.sort((x, y) => newestFirst(x.fact, y.fact))
  const kept = facts.filter(f => results[f.id]?.outcome !== 'forgotten')
  return {
    rows: rows.slice(0, MEMORY_ROW_CAP),
    active: kept.length,
    inHotSet: kept.filter(f => f.inHotSet).length,
    forgotten: Object.values(results).filter(r => r.outcome === 'forgotten').length,
    hidden: Math.max(0, rows.length - MEMORY_ROW_CAP),
  }
}

// A second press that fails after a forget that worked (a double press) must not hide the forget.
export function mergeMemory(results: MemoryResults, result: MemoryResult): MemoryResults {
  if (result.outcome === 'failed' && results[result.fact.id]?.outcome === 'forgotten') return results
  return { ...results, [result.fact.id]: result }
}

export function cancelForget(results: MemoryResults, id: string): MemoryResults {
  const { [id]: _, ...rest } = results
  return rest
}

export function forgetArgv(workspace: string, id: string): string[] {
  return [`${workspace}/a0`, 'memory', 'forget', id]
}

function firstLine(text: string): string {
  return text.split('\n').map(l => l.trim()).find(l => l !== '') ?? ''
}

export function forgetResult(fact: Fact, ran: RunResult | Error): MemoryResult {
  if (ran instanceof Error) {
    return { fact, outcome: 'failed', message: /time/i.test(ran.message) ? 'timed out' : 'could not run', citedBy: [] }
  }
  const lines = ran.stdout.split('\n')
  if (ran.exitCode === 0 && lines.some(l => l.startsWith('forgot:'))) {
    const citedBy = lines.map(l => /^\s*skill:(\S+) cites it/.exec(l)?.[1]).filter((id): id is string => id !== undefined)
    return { fact, outcome: 'forgotten', message: '', citedBy }
  }
  return { fact, outcome: 'failed', message: firstLine(ran.stderr) || firstLine(ran.stdout) || `exit ${ran.exitCode}`, citedBy: [] }
}
