import { expect, test } from 'claude-code/testing'
import type { Fact } from '../types'
import type { MemoryRow } from './memory'
import { age, factDetail, factMeta, reviewMeta, shortDate, sourceChip, themeOf } from './view'

const fact = (over: Partial<Fact> = {}): Fact => ({
  id: 'fact:a', sentence: 'Use pnpm.', said: '用 pnpm', author: 'human', createdAt: '2026-10-06T23:30:00.000-07:00', scope: 'project', inHotSet: true, factKey: null, replaces: null, ...over,
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

test('factMeta: the words, then the date and task; the hot set is a section, not a tag', () => {
  const m = factMeta(row(fact({ scope: 'task' })))
  expect(m.words).toBe('“用 pnpm”')
  expect(text(m.tags)).toBe('Oct 6 · task')
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

// The desktop app does not wrap a long Chinese line in a pane; it cut the quote at the edge
// (lab, 2026-10-08). The quote is cut here instead, Chinese counting double.
test('factMeta cuts long words, counting Chinese double', () => {
  const zh = factMeta(row(fact({ said: '记得这个项目无论我讲什么你都要用英文回复，还要简短，不要啰嗦，谢谢' })))
  expect(zh.words).toBe('“记得这个项目无论我讲什么你都要用英文回复，还要…”')
  const en = factMeta(row(fact({ said: 'Use pnpm in this project for every install and every script, never npm.' })))
  expect(en.words).toBe('“Use pnpm in this project for every install and…”')
  expect(factMeta(row(fact({ said: '用 pnpm' }))).words).toBe('“用 pnpm”')
})

const NOW = Date.parse('2026-10-15T12:00:00Z')
test('age', () => {
  expect(age(NOW, '2026-10-15T11:30:00Z')).toBe('now')
  expect(age(NOW, '2026-10-15T07:00:00Z')).toBe('5h')
  expect(age(NOW, '2026-10-12T12:00:00Z')).toBe('3d')
  expect(age(NOW, '2026-09-10T12:00:00Z')).toBe('5w')
  expect(age(NOW, null)).toBe('—')
  expect(age(NOW, 'soon')).toBe('—')
})

test('sourceChip', () => {
  expect(sourceChip(fact({ said: '周五别部署' }))).toEqual({ text: '❝ yours', dim: false })
  expect(sourceChip(fact({ said: null }))).toEqual({ text: '◇ inferred', dim: true })
})

test('factDetail shows the whole words and what it replaced', () => {
  expect(factDetail(row(fact({ said: 'x'.repeat(80), replaces: 'Stand-up at 9.' }))))
    .toEqual([`“${'x'.repeat(80)}”`, 'Replaced “Stand-up at 9.”'])
  expect(factDetail(row(fact({ said: null })))).toEqual(['Inferred by the assistant, kept by you'])
})
