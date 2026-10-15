// Draws the README's HUD figures (docs/hud/*.svg) with the plugin's own drawing code and sample
// data, so the pictures follow the HUD when it changes. Run: bun scripts/render_hud.ts
// The desktop lays its native buttons over the drawings; here they are drawn as outlined pills.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  bandSvg, factCard, groupHeader, itemCard, memoryHeader, reviewHeader, textWidth,
  type Drawing, type FactCardData,
} from '../plugins/agentzero/hooks/instruments'

const OUT = join(import.meta.dir, '..', 'docs', 'hud')
const PAD = 20
const W = 620
const FONT = `-apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, system-ui, sans-serif`
const OUTLINE = { red: '#d4493b', blue: '#3366f0', green: '#1f9d61', grey: '#c4c6cc', claude: '#d97757' }

// A drawing placed at (x, y) inside the figure, at its own design width.
function place(d: Drawing, x: number, y: number, w: number): string {
  return d.svg.replace(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="[^"]*"( height="[^"]*")?/,
    `<svg x="${x}" y="${y}" width="${d.width ?? w}" height="${d.height}"`)
}

function button(right: number, cy: number, label: string, outline: string, filled = false): { svg: string; w: number } {
  const w = Math.round(textWidth(label, 12.5) + 26)
  const x = right - w
  return {
    svg: `<rect x="${x}" y="${cy - 13}" width="${w}" height="26" rx="13" fill="${filled ? outline : 'none'}" stroke="${outline}" stroke-width="1.5"/>` +
      `<text x="${x + w / 2}" y="${cy + 4.5}" font-family="${FONT}" font-size="12.5" font-weight="500" text-anchor="middle" class="${filled ? '' : 'ink'}"${filled ? ' fill="#ffffff"' : ''}>${label}</text>`,
    w,
  }
}

function figure(name: string, height: number, body: string, inner = W): void {
  const w = inner + 2 * PAD
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${height}" viewBox="0 0 ${w} ${height}">` +
    `<rect x="0.5" y="0.5" width="${w - 1}" height="${height - 1}" rx="14" class="bg hair-s" stroke-width="1"/>${body}</svg>\n`
  writeFileSync(join(OUT, name), svg)
  console.log(`docs/hud/${name}`)
}

// The band: the drawing, then Review and Memory at the right.
{
  const d = bandSvg({ loaded: 3, active: 6, waiting: 2, context: 34, failed: null }, 1000)
  const inner = d.width! + 190
  const memory = button(inner + PAD, 30, 'Memory', OUTLINE.grey)
  const review = button(inner + PAD - memory.w - 10, 30, 'Review', OUTLINE.claude, true)
  figure('band.svg', 60, place(d, PAD, 16, d.width!) + review.svg + memory.svg, inner)
}

// The Memory pane, with the second row hovered and one memory forgotten.
{
  const base: FactCardData = {
    sentence: '', loaded: true, state: 'active', yours: true, age: null, task: false, updated: false,
    quote: null, replaces: null, message: null, cited: null,
  }
  const inUse: FactCardData[] = [
    { ...base, sentence: 'Use pnpm in this project, never npm', age: '3d', quote: 'Use pnpm in this project, never npm.' },
    { ...base, sentence: 'Tests run against the staging database', age: '1w', updated: true, quote: 'Run the tests on staging, not local.', replaces: 'Tests run against a local database' },
    { ...base, sentence: 'Keep the changelog in plain English', yours: false, age: '2w' },
  ]
  const saved: FactCardData[] = [
    { ...base, loaded: false, sentence: 'Release notes go out on Mondays', age: '3w', quote: 'We send release notes on Mondays.' },
    { ...base, loaded: false, sentence: 'This fix touches only the parser', age: '5h', task: true, quote: 'Only change the parser for this.' },
  ]
  const forgotten: FactCardData = { ...base, loaded: false, state: 'forgotten', sentence: 'Deploy from the release branch' }
  const head = memoryHeader({
    loaded: 3, active: 6, waiting: 2, newest: '5h ago',
    hotSet: { text: 'at 14:02', failed: false },
    dots: [
      { days: 0.2, loaded: false, title: '' }, { days: 3, loaded: true, title: '' }, { days: 7, loaded: true, title: '' },
      { days: 14, loaded: true, title: '' }, { days: 21, loaded: false, title: '' }, { days: 26, loaded: false, title: '' },
    ],
  }, W)
  let y = PAD
  let body = place(head, PAD, y, W)
  y += head.height + 14
  const group = (label: string, cards: Drawing[], note: { text: string; failed: boolean } | null, pills: Map<number, string> = new Map()) => {
    const g = groupHeader(label, cards.length, W, note)
    body += place(g, PAD, y, W)
    y += g.height + 4
    cards.forEach((c, i) => {
      body += place(c, PAD, y, W)
      const pill = pills.get(i)
      if (pill === 'Forget') body += button(W + PAD - 10, y + c.height / 2, 'Forget', OUTLINE.red).svg
      if (pill === 'Restore') body += button(W + PAD - 10, y + c.height / 2, '↺ Restore', OUTLINE.blue).svg
      y += c.height + 4
    })
    y += 10
  }
  group('In use now', inUse.map((c, i) => factCard(c, W, i === 1)), null, new Map([[1, 'Forget']]))
  group('Saved, not in use', saved.map(c => factCard(c, W, false)), null)
  group('Forgotten', [factCard(forgotten, W, false)], null, new Map([[0, 'Restore']]))
  figure('memory-pane.svg', y + PAD - 10, body)
}

// The Review pane: two items to review, one kept.
{
  const head = reviewHeader({ waiting: 2, done: 1 }, W)
  let y = PAD
  let body = place(head, PAD, y, W)
  y += head.height + 14
  const items = [
    { sentence: 'Never deploy on Fridays', meta: "Fact · Claude's wording, from the deploy note · now", state: 'open' as const },
    { sentence: 'Draft release notes with the notes skill', meta: 'Skill · after 3 runs of the same task · 2d', state: 'open' as const },
    { sentence: 'Name branches after the ticket', meta: 'Fact · from the README · 1d', state: 'kept' as const },
  ]
  for (const [i, it] of items.entries()) {
    if (i === 0 || i === 2) {
      const g = groupHeader(i === 0 ? 'To review' : 'Done', i === 0 ? 2 : 1, W)
      if (i === 2) y += 10
      body += place(g, PAD, y, W)
      y += g.height + 4
    }
    const c = itemCard({ ...it, message: null }, W)
    body += place(c, PAD, y, W)
    if (it.state === 'open') {
      const reject = button(W + PAD - 10, y + c.height / 2, 'Reject', OUTLINE.grey)
      const keep = button(W + PAD - 10 - reject.w - 8, y + c.height / 2, '✓ Keep', OUTLINE.green)
      body += keep.svg + reject.svg
    }
    y += c.height + 4
  }
  figure('review-pane.svg', y + PAD, body)
}
