import { expect, test } from 'claude-code/testing'
import { columnsToPx, dotX, escapeXml, lightSvg, ringSvg, stripSvg, textGauge, type Dot } from './instruments'

const DOTS: Dot[] = [{ days: 0.1, loaded: true, title: 'a < b & "c"' }, { days: 40, loaded: false, title: 'old' }]

test('columnsToPx', () => {
  expect(columnsToPx(140)).toBe(798)
  expect(columnsToPx(20)).toBe(180)
})

test('escapeXml', () => {
  expect(escapeXml(`a<b>&"c"'d`)).toBe('a&lt;b&gt;&amp;&quot;c&quot;&apos;d')
})

test('dotX', () => {
  expect(dotX(0, 10, 310)).toBe(310)
  expect(dotX(15, 10, 310)).toBe(160)
  expect(dotX(45, 10, 310)).toBe(10)
})

// The graphics carry no text: labels and figures are the app's own Text (operator, 2026-10-15:
// text drawn inside the SVG clashed with the list's type).
test('ringSvg: a 32 px ring lit by share, both palettes, no text', () => {
  const svg = ringSvg(3, 6)
  expect(svg).toContain('width="32" height="32"')
  expect(svg).toContain('stroke-dasharray="40.84 81.68"')
  expect(svg).toContain('prefers-color-scheme: dark')
  expect(svg).not.toContain('<text')
})

// A zero-length dash with a round cap would still draw a dot at 12 o'clock.
test('ringSvg with nothing lit draws the track alone', () => {
  for (const svg of [ringSvg(0, 0), ringSvg(0, 5)]) {
    expect(svg).not.toContain('class="lit"')
    expect(svg).not.toContain('NaN')
  }
})

test('lightSvg: amber with a halo when something waits, grey when not', () => {
  expect(lightSvg(2)).toContain('class="amber"')
  expect(lightSvg(2)).toContain('class="halo"')
  expect(lightSvg(0)).toContain('class="off"')
  expect(lightSvg(0)).not.toContain('class="halo"')
})

test('stripSvg: the pane width, one dot per Fact, escaped titles, no text', () => {
  const svg = stripSvg(DOTS, 140)
  expect(svg).toContain('width="798" height="18"')
  expect(svg.match(/<circle /g)!.length).toBe(2)
  expect(svg).toContain('<title>a &lt; b &amp; &quot;c&quot;</title>')
  expect(svg).not.toContain('<text')
  expect(stripSvg([], 20)).toContain('width="180"')
  expect(stripSvg([], 20)).not.toContain('NaN')
})

test('textGauge', () => {
  expect(textGauge(3, 5)).toBe('▰▰▰▱▱')
  expect(textGauge(1, 50)).toBe('▰▱▱▱▱')
  expect(textGauge(0, 0)).toBe('▱▱▱▱▱')
  expect(textGauge(5, 5, 8)).toBe('▰▰▰▰▰▰▰▰')
})
