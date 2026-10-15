import { expect, test } from 'claude-code/testing'
import { columnsToPx, dotX, escapeXml, memoryCluster, reviewCluster, ringPath, textGauge, type MemoryFigures } from './instruments'

const F: MemoryFigures = {
  loaded: 3, active: 5, yours: 4, waiting: 2, loadedAt: 'at 14:02',
  dots: [{ days: 0.1, loaded: true, title: 'a < b & "c"' }, { days: 40, loaded: false, title: 'old' }],
  oldest: '6w', newest: 'now',
}

test('columnsToPx', () => {
  expect(columnsToPx(140)).toBe(798)
  expect(columnsToPx(20)).toBe(180)
})

test('escapeXml', () => {
  expect(escapeXml(`a<b>&"c"'d`)).toBe('a&lt;b&gt;&amp;&quot;c&quot;&apos;d')
})

test('ringPath', () => {
  expect(ringPath(0, 20, 30, 30)).toBeNull()
  expect(ringPath(0.2, 20, 30, 30)).toMatch(/^M30 10 A20 20 0 0 1 /)
  expect(ringPath(1, 20, 30, 30)!.match(/A20 20/g)!.length).toBe(2)
})

test('dotX', () => {
  expect(dotX(0, 10, 310)).toBe(310)
  expect(dotX(15, 10, 310)).toBe(160)
  expect(dotX(45, 10, 310)).toBe(10)
})

test('memoryCluster: figures, escaped titles, both palettes, no NaN', () => {
  const svg = memoryCluster(F, 140)
  for (const s of ['LOADED', '3 / 5', 'at 14:02', 'YOUR WORDS', '4 / 5', '1 inferred', 'OLDEST 6w · NEWEST now', 'WAITING'])
    expect(svg).toContain(s)
  expect(svg).toContain('<title>a &lt; b &amp; &quot;c&quot;</title>')
  expect(svg).toContain('prefers-color-scheme: dark')
  expect(svg).toContain('width="798"')
  expect(svg).not.toContain('NaN')
})

test('memoryCluster before any hot set says so', () => {
  expect(memoryCluster({ ...F, loadedAt: null }, 140)).toContain('not loaded yet')
  expect(memoryCluster({ ...F, loadedAt: '1d ago' }, 140)).toContain('1d ago')
})

test('memoryCluster with nothing active reads 0 / 0', () => {
  const svg = memoryCluster({ ...F, loaded: 0, active: 0, yours: 0, dots: [], oldest: null, newest: null }, 140)
  expect(svg).toContain('0 / 0')
  expect(svg).not.toContain('NaN')
})

test('a narrow pane gets the grid', () => {
  expect(memoryCluster(F, 34)).toContain('data-layout="grid"')
  expect(memoryCluster(F, 140)).toContain('data-layout="row"')
  expect(memoryCluster(F, 20)).toContain('width="180"')
})

test('reviewCluster: waiting and done', () => {
  const svg = reviewCluster({ waiting: 2, done: 1 }, 140)
  for (const s of ['WAITING', 'DONE', 'prefers-color-scheme: dark']) expect(svg).toContain(s)
  expect(svg).not.toContain('NaN')
})

test('textGauge', () => {
  expect(textGauge(3, 5)).toBe('▰▰▰▱▱')
  expect(textGauge(1, 50)).toBe('▰▱▱▱▱')
  expect(textGauge(0, 0)).toBe('▱▱▱▱▱')
  expect(textGauge(5, 5, 8)).toBe('▰▰▰▰▰▰▰▰')
})

// Review: at 60–95 columns the row layout put WAITING inside YOUR WORDS and ran the axis backwards.
test('the row layout needs 96 columns; narrower panes get the grid', () => {
  expect(memoryCluster(F, 80)).toContain('data-layout="grid"')
  expect(memoryCluster(F, 95)).toContain('data-layout="grid"')
  const row = memoryCluster(F, 96)
  expect(row).toContain('data-layout="row"')
  const [, x1, x2] = /<line x1="([\d.]+)" y1="46" x2="([\d.]+)" y2="46"/.exec(row)!
  expect(Number(x2) - Number(x1) >= 100).toBe(true)
})
