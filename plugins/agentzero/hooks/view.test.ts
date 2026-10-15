import { expect, test } from 'claude-code/testing'
import type { Fact } from '../types'
import type { MemoryRow } from './memory'
import { age, columnsInline, factDetail, hotSetNote, sourceChip, themeOf } from './view'

const fact = (over: Partial<Fact> = {}): Fact => ({
  id: 'fact:a', sentence: 'Use pnpm.', said: '用 pnpm', author: 'human', createdAt: '2026-10-06T23:30:00.000-07:00', scope: 'project', inHotSet: true, factKey: null, replaces: null, ...over,
})
const row = (f: Fact, state: MemoryRow['state'] = 'active'): MemoryRow => ({ fact: f, state, message: null, citedBy: [], actionable: true })
const text = (segs: { text: string }[]) => segs.map(s => s.text).join('')

test('themeOf maps tones to theme keys; grey and ink have none', () => {
  expect([themeOf('green'), themeOf('amber'), themeOf('blue'), themeOf('red'), themeOf('grey'), themeOf('ink')]).toEqual(['success', 'warning', 'suggestion', 'error', undefined, undefined])
})

// The desktop app does not wrap a long Chinese line in a pane; it cut the quote at the edge
// (lab, 2026-10-08). The quote is cut here instead, Chinese counting double.
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

test('columns sit beside the sentence from 70 columns', () => {
  expect(columnsInline(70)).toBe(true)
  expect(columnsInline(69)).toBe(false)
})

// Review: an HH:MM alone passed off yesterday's hot set as this conversation's; a failed load said nothing.
test('hotSetNote: today, an earlier day, failed, none', () => {
  const local = (h: number, m: number, dayOffset = 0) => { const d = new Date(NOW); d.setHours(h, m, 0, 0); d.setDate(d.getDate() + dayOffset); return d }
  const now = local(15, 0).getTime()
  expect(hotSetNote(now, local(14, 2).toISOString(), null)).toEqual({ text: 'at 14:02', failed: false })
  expect(hotSetNote(now, local(14, 2, -1).toISOString(), null)).toEqual({ text: '1d ago', failed: false })
  expect(hotSetNote(now, local(14, 2).toISOString(), 'exit 1')).toEqual({ text: 'not loaded (exit 1)', failed: true })
  expect(hotSetNote(now, null, null)).toBeNull()
})
