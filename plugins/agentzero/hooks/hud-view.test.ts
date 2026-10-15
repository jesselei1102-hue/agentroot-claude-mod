import { expect, test } from 'claude-code/testing'
import type { Fact } from '../types'
import { memoryFigures, memoryPane, reviewPane, type Els, type ViewCtx } from './hud-view'
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

// Forget reads as a destructive action (operator, 2026-10-15: "enhance the forget button"): a red
// label in a round red outline, centred on the card's height. The Button stays plain: a bordered
// Button takes the keyboard and the next click is lost (1.3).
test('desktop: Forget is a red pill centred on the hovered card; Restore a blue one', () => {
  const pill = (nodes: Node[], key: string) => {
    const button = nodes.find(n => n.type === 'Button' && n.props.key === key)!
    const holder = nodes.find(n => n.type === 'Box' && walk(n.props.children).includes(button) && n.props.borderStyle === 'round')!
    return { button, holder }
  }
  const active = pill(walk(memoryPane(ELS, view([row(A)], [A]), act, ctx('desktop'))), 'az-forget-fact:a')
  expect(active.button.props.plain).toBe(true)
  expect(active.holder.props.borderColor).toBe('error')
  const centre = walk(memoryPane(ELS, view([row(A)], [A]), act, ctx('desktop'))).find(n => n.type === 'Box' && n.props.position === 'absolute' && n.props.alignItems === 'center' && n.props.top === 0 && n.props.bottom === 0)
  expect(centre).toBeDefined()
  const gone: MemoryRow = { ...row(A, 'forgotten'), actionable: false }
  const restore = pill(walk(memoryPane(ELS, view([gone], []), act, ctx('desktop'))), 'az-restore-fact:a')
  expect(restore.holder.props.borderColor).toBe('suggestion')
})

// Keep and Reject as pills too (operator, 2026-10-15): Keep in green, Reject quiet, centred on the card.
test('desktop: Keep is a green pill and Reject a quiet one, side by side on each open item', () => {
  const item = { id: 'fact:p', kind: 'fact', sentence: 'x', provenance: 'agent proposed it', createdAt: null }
  const nodes = walk(reviewPane(ELS, { rows: [{ item, state: 'open', message: null, actionable: true }], open: 1, done: 0 }, { decide: () => {} }, ctx('desktop')))
  const holder = (key: string) => {
    const button = nodes.find(n => n.type === 'Button' && n.props.key === key)!
    expect(button.props.plain).toBe(true)
    return nodes.find(n => n.type === 'Box' && n.props.borderStyle === 'round' && walk(n.props.children).includes(button))!
  }
  expect(holder('az-keep-fact:p').props.borderColor).toBe('success')
  expect(holder('az-reject-fact:p').props.borderDimColor).toBe(true)
  expect(nodes.some(n => n.type === 'Box' && n.props.position === 'absolute' && n.props.alignItems === 'center' && n.props.top === 0 && n.props.bottom === 0)).toBe(true)
})
