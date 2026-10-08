import { expect, test } from 'claude-code/testing'
import type { Fact } from '../types'
import type { MemoryRow } from './memory'
import { factMeta, reviewMeta, shortDate, themeOf } from './view'

const fact = (over: Partial<Fact> = {}): Fact => ({
  id: 'fact:a', sentence: 'Use pnpm.', said: '用 pnpm', author: 'human', createdAt: '2026-10-06T23:30:00.000-07:00', scope: 'project', inHotSet: true, ...over,
})
const row = (f: Fact, state: MemoryRow['state'] = 'active'): MemoryRow => ({ fact: f, state, message: null, citedBy: [], actionable: true })
const text = (segs: { text: string }[]) => segs.map(s => s.text).join('')

test('themeOf maps tones to theme keys; grey and ink have none', () => {
  expect([themeOf('green'), themeOf('amber'), themeOf('blue'), themeOf('red'), themeOf('grey'), themeOf('ink')]).toEqual(['success', 'warning', 'suggestion', 'error', undefined, undefined])
})

test('shortDate reads the date part, whatever the zone', () => {
  expect(shortDate('2026-10-06T23:30:00.000-07:00')).toBe('Oct 6')
  expect(shortDate('2026-01-31T00:10:00+08:00')).toBe('Jan 31')
  expect(shortDate(null)).toBeNull()
  expect(shortDate('soon')).toBeNull()
})

test('factMeta: words on their own line; date, hot set and task after', () => {
  const m = factMeta(row(fact({ scope: 'task' })))
  expect(m.words).toBe('“用 pnpm”')
  expect(text(m.tags)).toBe('Oct 6 · in hot set · task')
  expect(m.tags.find(s => s.text === 'in hot set')?.color).toBe('suggestion')
})

test('factMeta: inferred, no hot set when forgotten', () => {
  const m = factMeta(row(fact({ said: null, author: 'agent' }), 'forgotten'))
  expect(m.words).toBe('Inferred by the assistant, kept by you')
  expect(text(m.tags)).toBe('Oct 6')
})

test('reviewMeta: provenance and date', () => {
  expect(reviewMeta({ id: 'fact:x', kind: 'fact', sentence: 's', provenance: 'agent proposed it', createdAt: '2026-10-04T10:49:18+08:00' })).toBe('agent proposed it · Oct 4')
  expect(reviewMeta({ id: 'fact:x', kind: 'fact', sentence: 's', provenance: 'agent proposed it', createdAt: null })).toBe('agent proposed it')
})
