import { expect, test } from 'claude-code/testing'
import type { HudState } from '../types'
import { bandModel } from './band'

const NOW = Date.parse('2026-10-05T10:00:00+08:00')
const item = (id: string) => ({ id, kind: 'fact', sentence: id, provenance: 'agent proposed it', createdAt: null })
const hud = (active: number, pending: number, at: string | null = '2026-10-05T09:57:00+08:00'): HudState => ({
  snapshot: { active, pending: Array.from({ length: pending }, (_, i) => item(`fact:${i}`)), hotSet: at === null ? null : { at, factIds: [] }, facts: null },
  error: null,
  stale: false,
})

const fact = (id: string, inHotSet: boolean, said: string | null) =>
  ({ id, sentence: id, said, author: 'human', createdAt: null, scope: 'project', inHotSet, factKey: null, replaces: null })
const withFacts = (h: HudState): HudState =>
  ({ ...h, snapshot: { ...h.snapshot!, facts: [fact('a', true, 'x'), fact('b', false, 'y'), fact('c', false, null)] } })

test('band pills: loaded, yours, waiting', () => {
  const m = bandModel(withFacts(hud(3, 2)), null, 41, NOW)
  expect(m.pills.map(p => p.text)).toEqual(['● 1/3 loaded', '❝ 2/3 yours', '◉ 2 waiting'])
  expect(m.pills.map(p => p.tone)).toEqual(['blue', 'ink', 'amber'])
  expect(m.ring).toEqual({ percent: 41, tone: 'blue', note: null })
  expect(m.showReview).toBe(true)
  expect(m.alt).toBe('AgentZero memory: 1 of 3 loaded, 2 in your words, 2 waiting')
})

test('band states', () => {
  expect(bandModel(withFacts(hud(3, 0)), null, 41, NOW).pills.map(p => p.text)).toEqual(['● 1/3 loaded', '❝ 2/3 yours'])
  expect(bandModel(withFacts(hud(3, 0)), null, 41, NOW).showReview).toBe(false)
  expect(bandModel(withFacts(hud(3, 1)), 'exit 1', 41, NOW).pills[0]).toEqual({ text: 'hot set not loaded (exit 1)', tone: 'red' })
  // no fact list: the count alone
  expect(bandModel(hud(3, 1), null, 41, NOW).pills.map(p => p.text)).toEqual(['3 active', '◉ 1 waiting'])
  expect(bandModel(hud(3, 1), 'exit 1', 41, NOW).pills.map(p => p.text)).toEqual(['3 active', 'hot set not loaded (exit 1)', '◉ 1 waiting'])
  expect(bandModel(hud(3, 1), null, 85.4, NOW).ring).toEqual({ percent: 85, tone: 'amber', note: 'reloads after compaction' })
  expect(bandModel(hud(3, 1), null, undefined, NOW).ring).toBeNull()
  const failed = bandModel({ snapshot: null, error: 'timed out', stale: false }, null, 41, NOW)
  expect(failed.pills.map(p => p.text)).toEqual(['memory unreadable'])
  expect(failed.alt).toBe('AgentZero memory: state unknown')
  expect(failed.showReview).toBe(false)
  expect(bandModel({ snapshot: null, error: null, stale: false }, null, 41, NOW).pills[0]).toEqual({ text: 'reading memory…', tone: 'grey' })
})

test('showMemory with a snapshot, even with no Facts', () => {
  expect(bandModel(hud(0, 0), null, 41, NOW).showMemory).toBe(true)
})

test('no showMemory without a snapshot', () => {
  expect(bandModel({ snapshot: null, error: 'timed out', stale: false }, null, 41, NOW).showMemory).toBe(false)
})

// What the desktop draws: the figures, known only with a fact list.
test('band drawing data', () => {
  expect(bandModel(withFacts(hud(3, 2)), null, 41, NOW).drawn).toEqual({ loaded: 1, active: 3, yours: 2, waiting: 2, context: 41, failed: null })
  expect(bandModel(withFacts(hud(3, 2)), 'exit 1', undefined, NOW).drawn).toEqual({ loaded: 1, active: 3, yours: 2, waiting: 2, context: null, failed: 'exit 1' })
  expect(bandModel(hud(3, 2), null, 41, NOW).drawn).toBeNull()
})
