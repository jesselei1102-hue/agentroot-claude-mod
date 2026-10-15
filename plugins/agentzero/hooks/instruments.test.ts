import { expect, test } from 'claude-code/testing'
import {
  bandSvg, designWidth, dotX, escapeXml, factCard, fitText, groupHeader, itemCard, memoryHeader, reviewHeader, textGauge, textWidth,
  type FactCardData, type MemoryHeaderData,
} from './instruments'

const HEAD: MemoryHeaderData = {
  loaded: 3, active: 6, yours: 5, waiting: 2, newest: '1h',
  hotSet: { text: 'today at 14:02', failed: false },
  dots: [{ days: 0.1, loaded: true, title: 'a < b & "c"' }, { days: 40, loaded: false, title: 'old' }],
}
const CARD: FactCardData = {
  sentence: 'Never deploy on Fridays.', loaded: true, state: 'active', yours: true, age: '2d', task: false,
  updated: false, quote: '周五别部署', replaces: null, message: null, cited: null,
}
const noNaN = (svg: string) => expect(/NaN|Infinity|undefined/.test(svg)).toBe(false)

// 7 drew the cards about 1.3 times too large in the app (operator's screenshots, 2026-10-15).
test('designWidth: about 8.8 px a column, within 240–1300', () => {
  expect(designWidth(100)).toBe(880)
  expect(designWidth(10)).toBe(240)
  expect(designWidth(400)).toBe(1300)
})

test('escapeXml', () => {
  expect(escapeXml(`a<b>&"c"'d`)).toBe('a&lt;b&gt;&amp;&quot;c&quot;&apos;d')
})

test('textWidth counts a full-width character as a whole em', () => {
  expect(textWidth('周五', 14)).toBe(28)
  expect(textWidth('ab', 10) < textWidth('周', 10) * 2).toBe(true)
})

test('fitText cuts with an ellipsis to the width, and keeps what fits', () => {
  expect(fitText('Never deploy on Fridays.', 14, 1000)).toBe('Never deploy on Fridays.')
  const cut = fitText('介绍新课程知识时，先指出它在知识地图中的位置，再展开细节。', 14, 140)
  expect(cut.endsWith('…')).toBe(true)
  expect(textWidth(cut, 14) <= 140).toBe(true)
})

test('dotX', () => {
  expect(dotX(0, 10, 310)).toBe(310)
  expect(dotX(15, 10, 310)).toBe(160)
  expect(dotX(45, 10, 310)).toBe(10)
})

test('every drawing fills the pane width, scales without stretching, and has both palettes', () => {
  for (const d of [memoryHeader(HEAD, 700), groupHeader('Loaded now', 3, 700), factCard(CARD, 700, false), reviewHeader({ waiting: 2, done: 1 }, 700),
    itemCard({ sentence: 'x', state: 'open', meta: 'Fact', message: null }, 700)]) {
    expect(d.svg).toContain('width="100%"')
    expect(d.svg).toContain(`viewBox="0 0 700 ${d.height}"`)
    expect(d.svg).not.toContain('preserveAspectRatio="none"')
    expect(d.svg).toContain('prefers-color-scheme: dark')
    noNaN(d.svg)
  }
})

test('memoryHeader: the figure, its gauge, the tiles and the timeline', () => {
  const { svg } = memoryHeader(HEAD, 700)
  for (const s of ['MEMORY IN THIS CONVERSATION', '>3<', 'of 6 loaded', 'Hot set loaded today at 14:02', 'YOUR WORDS', 'WAITING', 'NEWEST', '1h', 'Today', '30 days'])
    expect(svg).toContain(s)
  expect(svg.match(/class="cell on"/g)!.length).toBe(3)
  expect(svg.match(/class="cell"/g)!.length).toBe(3)
  expect(svg).toContain('<title>a &lt; b &amp; &quot;c&quot;</title>')
})

test('memoryHeader: a failed hot set is said in red; none yet is said plainly', () => {
  expect(memoryHeader({ ...HEAD, hotSet: { text: 'not loaded (exit 1)', failed: true } }, 700).svg).toContain('class="red"')
  expect(memoryHeader({ ...HEAD, hotSet: null }, 700).svg).toContain('No hot set loaded yet')
})

test('memoryHeader with nothing active: zero, no cells lit, no NaN', () => {
  const { svg } = memoryHeader({ ...HEAD, loaded: 0, active: 0, yours: 0, waiting: 0, newest: null, dots: [] }, 240)
  expect(svg).toContain('>0<')
  expect(svg).not.toContain('class="cell on"')
  noNaN(svg)
})

test('memoryHeader keeps at most 12 cells, lit in proportion', () => {
  const { svg } = memoryHeader({ ...HEAD, loaded: 30, active: 60 }, 700)
  expect(svg.match(/class="cell( on)?"/g)!.length).toBe(12)
  expect(svg.match(/class="cell on"/g)!.length).toBe(6)
})

test('factCard: rail, sentence, source and age; hovered shows the words', () => {
  const plain = factCard(CARD, 700, false).svg
  expect(plain).toContain('class="rail on"')
  expect(plain).toContain('Never deploy on Fridays.')
  expect(plain).toContain('Your words')
  expect(plain).toContain('2d')
  expect(plain).not.toContain('周五别部署')
  const hovered = factCard(CARD, 700, true).svg
  expect(hovered).toContain('class="tint"')
  expect(hovered).toContain('“周五别部署”')
})

test('factCard states: inferred, updated, task, forgotten, failed, cited', () => {
  expect(factCard({ ...CARD, yours: false, loaded: false }, 700, false).svg).toContain('Inferred')
  expect(factCard({ ...CARD, loaded: false }, 700, false).svg).toContain('class="rail"')
  expect(factCard({ ...CARD, updated: true }, 700, false).svg).toContain('Updated')
  expect(factCard({ ...CARD, task: true }, 700, false).svg).toContain('this task')
  expect(factCard({ ...CARD, replaces: 'Deploy any day.' }, 700, true).svg).toContain('replaced “Deploy any day.”')
  expect(factCard({ ...CARD, state: 'forgotten' }, 700, false).svg).toContain('text-decoration="line-through"')
  expect(factCard({ ...CARD, state: 'failed', message: 'timed out' }, 700, false).svg).toContain('timed out')
  expect(factCard({ ...CARD, state: 'forgotten', message: 'a newer Fact replaced it' }, 700, false).svg).toContain('a newer Fact replaced it')
  const cited = factCard({ ...CARD, state: 'forgotten', cited: 'Cited by skill js-setup' }, 700, false)
  expect(cited.svg).toContain('Cited by skill js-setup')
  expect(cited.height > factCard(CARD, 700, false).height).toBe(true)
})

test('itemCard leaves room at the right for Keep and Reject', () => {
  const long = 'Keep course notes as a concept list, then a flow chart, then the sources, for every reading.'
  const svg = itemCard({ sentence: long, state: 'open', meta: 'Fact · agent proposed it · 3h', message: null }, 400).svg
  const shown = /<text[^>]*class="ink s"[^>]*>([^<]*)</.exec(svg)![1]!
  expect(shown.endsWith('…')).toBe(true)
  expect(textWidth(shown, 14) <= 400 - 17 - 150).toBe(true)
})

// Scaled to its slot, the band came out larger than its buttons and cut "context 41%" (operator, 2026-10-15).
test('bandSvg is drawn at its own width, 1:1, so nothing is scaled or cut', () => {
  const b = bandSvg({ loaded: 3, active: 6, yours: 5, waiting: 2, context: 41, failed: null }, 2000)
  expect(b.svg).toContain(`width="${b.width}" height="28" viewBox="0 0 ${b.width} 28"`)
  expect(b.svg).not.toContain('width="100%"')
  expect(b.width > 300 && b.width < 700).toBe(true)
  const narrow = bandSvg({ loaded: 3, active: 6, yours: 5, waiting: 2, context: 41, failed: null }, 380)
  expect(narrow.width <= 380).toBe(true)
  expect(narrow.svg).not.toContain('context')
})

test('bandSvg: brand, figures, context; a failed hot set in red', () => {
  const ok = bandSvg({ loaded: 3, active: 6, yours: 5, waiting: 2, context: 41, failed: null }, 2000).svg
  for (const s of ['AgentZero', '3/6 loaded', '5/6 yours', '2 waiting', '41%']) expect(ok).toContain(s)
  const bad = bandSvg({ loaded: 3, active: 6, yours: 5, waiting: 0, context: 85, failed: 'exit 1' }, 2000).svg
  expect(bad).toContain('hot set not loaded (exit 1)')
  expect(bad).not.toContain('waiting')
})

test('textGauge', () => {
  expect(textGauge(3, 5)).toBe('▰▰▰▱▱')
  expect(textGauge(1, 50)).toBe('▰▱▱▱▱')
  expect(textGauge(0, 0)).toBe('▱▱▱▱▱')
})
