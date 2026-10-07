import { expect, test } from 'claude-code/testing'
import { bandModel } from './band'
import { PALETTE, bandSvg, cardSvg, cutToWidth, escapeXml, factSvg, memoryHeaderSvg, paneHeaderSvg, pendingItemSvg, textWidth, wrap } from './svg'
import type { MemoryRow } from './memory'

test('escapeXml', () => {
  expect(escapeXml(`<a & "b" 'c'>`)).toBe('&lt;a &amp; &quot;b&quot; &apos;c&apos;&gt;')
})

test('textWidth counts CJK as full width', () => {
  expect(textWidth('中a', 12)).toBe(20)
})

test('wrap breaks at punctuation and cuts the last line, by display width', () => {
  // 18 CJK characters at 14.5 px
  expect(wrap('deploy-checklist：部署前先跑迁移、再看监控面板的检查清单', 261, 14.5, 2)).toEqual(['deploy-checklist：', '部署前先跑迁移、再看监控面板的检查…'])
  expect(wrap('短句', 261, 14.5, 2)).toEqual(['短句'])
  expect(wrap('Never deploy on Fridays because the release train stops on Thursday nights', 332, 14.5, 2)).toEqual([
    'Never deploy on Fridays because the',
    'release train stops on Thursday nights',
  ])
  const long = wrap('x'.repeat(200), 100, 10, 2)
  expect(long.length).toBe(2)
  expect(long[1].endsWith('…')).toBe(true)
  expect(textWidth(long[1], 10) <= 100).toBe(true)
})

test('cutToWidth keeps text within the width', () => {
  expect(cutToWidth('Short', 200, 12)).toBe('Short')
  const cut = cutToWidth('Documents the operator hands over are to be output as HTML files', 200, 12)
  expect(cut.endsWith('…')).toBe(true)
  expect(textWidth(cut, 12) <= 200).toBe(true)
})

test('the pane header puts the subline on its own line', () => {
  const header = paneHeaderSvg(1, 2)
  expect(header).toContain('Waiting for you')
  expect(header).toContain('The assistant inferred these. Keep or reject each one.')
  expect(header).toContain('y="38"')
})

test('bandSvg holds every pill and the ring', () => {
  const now = Date.parse('2026-10-05T10:00:00+08:00')
  const pending = [{ id: 'fact:a', kind: 'fact', sentence: 'a', provenance: 'p', createdAt: null }, { id: 'fact:b', kind: 'fact', sentence: 'b', provenance: 'p', createdAt: null }]
  const svg = bandSvg(bandModel({ snapshot: { active: 3, pending, hotSet: { at: '2026-10-05T09:57:00+08:00', factIds: [] }, facts: [] }, error: null, stale: false }, null, 41, now))
  for (const text of ['● AgentZero', '3 active', '2 waiting', 'hot set · 3 min ago', 'context 41%']) expect(svg).toContain(text)
  expect(svg).toContain(PALETTE.amber.fg)
  expect(svg.startsWith('<svg')).toBe(true)
})

test('cardSvg escapes and cuts', () => {
  const svg = cardSvg({ icon: '📌', label: 'Remembered', tone: 'green', title: 'a<b & "c"' + 'x'.repeat(80), detail: 'd', outline: false })
  expect(svg).toContain('&lt;b')
  expect(svg).toContain('&amp;')
  expect(svg).not.toContain('a<b')
  expect(svg).toContain('…')
  expect(svg).toContain('Remembered')
})

test('pendingItemSvg strikes a rejected item and shows a failure in red', () => {
  const item = { id: 'fact:a', kind: 'fact', sentence: 'Never deploy on Fridays', provenance: 'agent proposed it', createdAt: '2026-10-04T10:49:18+08:00' }
  const rejected = pendingItemSvg({ item, state: 'rejected', message: null })
  expect(rejected).toContain('line-through')
  expect(rejected).toContain('✗ Rejected')
  expect(rejected).toContain('10-04 10:49')
  const failed = pendingItemSvg({ item, state: 'failed', message: 'No pending item fact:a' })
  expect(failed).toContain(PALETTE.red.fg)
  expect(failed).toContain('No pending item fact:a')
  expect(paneHeaderSvg(1, 2)).toContain('2 done')
})

const memRow = (over: Partial<MemoryRow> = {}, fact: Partial<MemoryRow['fact']> = {}): MemoryRow => ({
  fact: { id: 'fact:a', sentence: 'Never deploy on Fridays.', said: '周五别部署', author: 'human', createdAt: '2026-10-02T11:12:00.000+08:00', scope: 'project', inHotSet: true, ...fact },
  state: 'active', message: null, citedBy: [], actionable: true, ...over,
})

test('memoryHeaderSvg: chips', () => {
  const none = memoryHeaderSvg(3, 1, 0)
  expect(none).toContain('Your memory')
  expect(none).toContain('Facts the assistant applies here. Forget any that are wrong.')
  expect(none).toContain('3 active')
  expect(none).toContain('1 in hot set')
  expect(none).not.toContain('forgotten')
  expect(memoryHeaderSvg(2, 1, 1)).toContain('1 forgotten')
})

test('factSvg: words and tags', () => {
  const svg = factSvg(memRow({}, { scope: 'task' }))
  expect(svg).toContain('Your words: “周五别部署”')
  expect(svg).toContain('in hot set')
  expect(svg).toContain('>task<')
  expect(svg).toContain('10-02 11:12')
})

test('factSvg: inferred', () => {
  expect(factSvg(memRow({}, { said: null, author: 'agent' }))).toContain('Inferred by the assistant, kept by you')
})

test('factSvg: forgotten', () => {
  const svg = factSvg(memRow({ state: 'forgotten', actionable: false }))
  expect(svg).toContain('✗ Forgotten')
  expect(svg).toContain('line-through')
  expect(svg).not.toContain('in hot set')
})

test('factSvg: failed shows the message', () => {
  const svg = factSvg(memRow({ state: 'failed', message: 'no active fact:a' }))
  expect(svg).toContain('no active fact:a')
  expect(svg).toContain(PALETTE.red.fg)
  expect(svg).not.toContain('Your words')
})

test('factSvg: cited by one and by two skills', () => {
  // the line wraps rather than cut the copy; join the <text> runs to read it whole
  const read = (svg: string) => (svg.match(/fill="#B26A00">[^<]*</g) ?? []).map(t => t.slice(15, -1)).join(' ')
  expect(read(factSvg(memRow({ state: 'forgotten', citedBy: ['deploy-check'] })))).toBe('Cited by skill deploy-check, which needs a new version')
  expect(read(factSvg(memRow({ state: 'forgotten', citedBy: ['a', 'b'] })))).toBe('Cited by skills a, b, which need new versions')
})

test('factSvg escapes', () => {
  const svg = factSvg(memRow({}, { sentence: 'a<b & "c"', said: '<x>' }))
  expect(svg).toContain('&lt;')
  expect(svg).toContain('&amp;')
  expect(svg).toContain('&quot;')
  expect(svg).not.toContain('a<b')
  expect(svg).not.toContain('<x>')
})

test('factSvg cuts a long Chinese sentence', () => {
  const svg = factSvg(memRow({}, { sentence: '部署'.repeat(40) }))
  const lines = svg.match(/<text[^>]*font-size="14.5"[^>]*>[^<]*<\/text>/g) ?? []
  expect(lines.length).toBe(2)
  expect(lines[1]).toContain('…')
})
