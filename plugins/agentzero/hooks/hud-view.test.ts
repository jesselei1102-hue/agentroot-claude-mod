import { expect, test } from 'claude-code/testing'
import type { Fact } from '../types'
import { memoryFigures, memoryPane, type Els, type ViewCtx } from './hud-view'
import type { MemoryRow } from './memory'

// Recording constructors: each element is { type, props }, so props the engine kit strips (hover) stay.
type Node = { type: string; props: Record<string, any> }
const el = (type: string) => (props: Record<string, unknown>) => ({ type, props }) as never
const ELS: Els = { Box: el('Box'), Text: el('Text'), Button: el('Button'), Svg: el('Svg') }
;(globalThis as any).h ??= (tag: any, props: any, ...children: any[]) => tag({ ...(props ?? {}), children })

function walk(n: unknown, out: Node[] = []): Node[] {
  if (Array.isArray(n)) n.forEach(c => walk(c, out))
  else if (n !== null && typeof n === 'object' && 'type' in (n as object)) {
    out.push(n as Node)
    walk((n as Node).props.children, out)
  }
  return out
}

const fact = (id: string, inHotSet: boolean, said: string | null): Fact =>
  ({ id, sentence: id, said, author: 'human', createdAt: '2026-10-14T10:00:00Z', scope: 'project', inHotSet, factKey: null, replaces: null })
const row = (f: Fact, state: MemoryRow['state'] = 'active'): MemoryRow => ({ fact: f, state, message: null, citedBy: [], actionable: true })
const A = fact('fact:a', true, 'x')
const B = fact('fact:b', false, null)
const view = (rows: MemoryRow[], facts: Fact[]) => ({ rows, facts, active: facts.length, waiting: 0, hidden: 0, hotSet: null })
const ctx = (surface: ViewCtx['surface']): ViewCtx => ({ surface, columns: 140, now: Date.parse('2026-10-15T12:00:00Z') })
const act = { forget: () => {}, restore: () => {} }

test('desktop: the details Box is hidden and revealed on hover, under its keyed row', () => {
  const nodes = walk(memoryPane(ELS, view([row(A)], [A]), act, ctx('desktop')))
  const keyed = nodes.find(n => n.type === 'Box' && n.props.key === 'az-row-fact:a')!
  const hidden = walk(keyed.props.children).filter(n => n.type === 'Box' && n.props.display === 'none')
  expect(hidden.length).toBe(1)
  expect(hidden[0]!.props.hover).toEqual({ display: 'flex' })
  expect(walk(hidden[0]!.props.children).some(n => n.type === 'Button' && n.props.key === 'az-forget-fact:a')).toBe(true)
})

// Review: mobile has no pointer, so a hover-only Forget could never be pressed there.
test('mobile and terminal show the details plainly', () => {
  for (const surface of ['mobile', 'terminal'] as const) {
    const nodes = walk(memoryPane(ELS, view([row(A)], [A]), act, ctx(surface)))
    expect(nodes.some(n => n.props.display === 'none')).toBe(false)
  }
})

// Review: a failed forget kept a stale in-hot-set row after the Fact left the snapshot, and the
// cluster read 2 / 1 while the band read 1/1.
test('the figures count the snapshot Facts, not the displayed rows', () => {
  const failed: MemoryRow = { ...row(fact('fact:gone', true, 'y'), 'failed'), message: 'timed out', actionable: false }
  const f = memoryFigures(view([row(A), row(B), failed], [A, B]), Date.parse('2026-10-15T12:00:00Z'))
  expect([f.loaded, f.yours, f.active, f.dots.length]).toEqual([1, 1, 2, 2])
})
