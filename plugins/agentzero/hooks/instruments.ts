// The instrument cluster atop the Memory and Review panes, as SVG source: pure, from figures.
// Laid out at the pane's own width (no stretching), in the system font, with a light and a dark
// palette the SVG picks itself (the desktop app's theme setting can be "auto").

export const PX_PER_COLUMN = 5.7
const MIN_PX = 180
// Below this the four instruments do not fit in one row (60–95 columns overlapped: review, 2026-10-15).
const GRID_BELOW_COLUMNS = 96
const DAYS = 30

export function columnsToPx(columns: number): number {
  return Math.max(MIN_PX, Math.round(columns * PX_PER_COLUMN))
}

export function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]!)
}

const n2 = (v: number) => String(Math.round(v * 100) / 100)

// The lit part of a ring, clockwise from 12 o'clock; nothing for 0, two half arcs for a full ring.
export function ringPath(fraction: number, r: number, cx: number, cy: number): string | null {
  if (!(fraction > 0)) return null
  const top = `M${n2(cx)} ${n2(cy - r)}`
  if (fraction >= 1) return `${top} A${r} ${r} 0 1 1 ${n2(cx)} ${n2(cy + r)} A${r} ${r} 0 1 1 ${n2(cx)} ${n2(cy - r)}`
  const a = 2 * Math.PI * fraction
  return `${top} A${r} ${r} 0 ${fraction > 0.5 ? 1 : 0} 1 ${n2(cx + r * Math.sin(a))} ${n2(cy - r * Math.cos(a))}`
}

// Today at the right edge, 30 days and older at the left.
export function dotX(days: number, left: number, right: number): number {
  const d = Math.min(DAYS, Math.max(0, days))
  return right - (d / DAYS) * (right - left)
}

export function textGauge(n: number, of: number, cells = 5): string {
  const lit = of > 0 ? Math.min(cells, Math.max(n > 0 ? 1 : 0, Math.round((n / of) * cells))) : 0
  return '▰'.repeat(lit) + '▱'.repeat(cells - lit)
}

export type Dot = { days: number; loaded: boolean; title: string }
export type MemoryFigures = {
  loaded: number
  active: number
  yours: number
  waiting: number
  loadedAt: string | null
  dots: Dot[]
  oldest: string | null
  newest: string | null
}

const FONT = `-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif`

// One meaning per colour: blue loaded, amber waiting, green done, grey secondary.
const STYLE = `<style>
text{font-family:${FONT};font-variant-numeric:tabular-nums}
.lbl{fill:#76746d;font-size:10.5px;font-weight:600;letter-spacing:.08em}
.fig{fill:#1f1e1b;font-size:20px;font-weight:600}
.figs{fill:#1f1e1b;font-size:14px;font-weight:600}
.sub{fill:#8a8881;font-size:11px}
.track{stroke:#e7e5de;fill:none}
.axis{stroke:#d9d7cf}
.blue{stroke:#2f6fde;fill:none}.blue-f{fill:#2f6fde}
.hollow{fill:none;stroke:#a9a7a0}
.amber-f{fill:#d08c10}.green-f{fill:#2f8a4e}.off-f{fill:#cfcdc5}
@media (prefers-color-scheme: dark){
.lbl{fill:#a3a19a}.fig,.figs{fill:#f2f1ec}.sub{fill:#8f8d87}
.track{stroke:#3a3935}.axis{stroke:#4a4944}
.blue{stroke:#6ea3ff}.blue-f{fill:#6ea3ff}.hollow{stroke:#77756f}
.amber-f{fill:#f2b544}.green-f{fill:#5cc28a}.off-f{fill:#4a4944}
}
</style>`

const GLOW = `<defs><filter id="glow" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="3.5"/></filter></defs>`

function svg(width: number, height: number, layout: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-layout="${layout}">${STYLE}${GLOW}${body}</svg>`
}

const text = (x: number, y: number, cls: string, s: string, anchor = 'start') =>
  `<text x="${n2(x)}" y="${n2(y)}" class="${cls}" text-anchor="${anchor}">${escapeXml(s)}</text>`

function ring(cx: number, cy: number, r: number, fraction: number): string {
  const lit = ringPath(fraction, r, cx, cy)
  return `<circle cx="${n2(cx)}" cy="${n2(cy)}" r="${r}" class="track" stroke-width="5"/>` +
    (lit !== null ? `<path d="${lit}" class="blue" stroke-width="5" stroke-linecap="round"/>` : '')
}

const share = (n: number, of: number) => (of > 0 ? n / of : 0)

// A gauge: the ring at the left, its label, figure and note beside it (row), or under it (grid).
function gauge(x: number, w: number, grid: boolean, label: string, n: number, of: number, note: string): string {
  if (!grid) return ring(x + 26, 44, 20, share(n, of)) + text(x + 58, 28, 'lbl', label) + text(x + 58, 52, 'fig', `${n} / ${of}`) + text(x + 58, 70, 'sub', note)
  const cx = x + w / 2
  return ring(cx, 28, 18, share(n, of)) + text(cx, 33, 'figs', `${n}/${of}`, 'middle') + text(cx, 64, 'lbl', label, 'middle') + text(cx, 79, 'sub', note, 'middle')
}

function light(cx: number, cy: number, waiting: number): string {
  if (waiting === 0) return `<circle cx="${n2(cx)}" cy="${n2(cy)}" r="7" class="off-f"/>`
  return `<circle cx="${n2(cx)}" cy="${n2(cy)}" r="9" class="amber-f" filter="url(#glow)"><animate attributeName="opacity" values=".35;.9;.35" dur="2.4s" repeatCount="indefinite"/></circle>` +
    `<circle cx="${n2(cx)}" cy="${n2(cy)}" r="7" class="amber-f"/>`
}

function waitingCell(x: number, w: number, grid: boolean, waiting: number): string {
  if (!grid) return light(x + 16, 44, waiting) + text(x + 34, 28, 'lbl', 'WAITING') + text(x + 34, 52, 'fig', String(waiting))
  const cx = x + w / 2
  return light(cx, 28, waiting) + text(cx, 64, 'lbl', 'WAITING', 'middle') + text(cx, 79, 'sub', String(waiting), 'middle')
}

function timeline(x: number, w: number, grid: boolean, f: MemoryFigures): string {
  const left = x + 8
  const right = x + w - 8
  const y = grid ? 34 : 46
  const dots = f.dots
    .map(d => {
      const cx = n2(dotX(d.days, left, right))
      const cls = d.loaded ? 'blue-f' : 'hollow'
      return `<circle cx="${cx}" cy="${y}" r="4" class="${cls}" stroke-width="1.5"><title>${escapeXml(d.title)}</title></circle>`
    })
    .join('')
  const span = f.oldest !== null && f.newest !== null
  const note = span ? (grid ? `${f.oldest} → ${f.newest}` : `OLDEST ${f.oldest} · NEWEST ${f.newest}`) : 'no dates'
  const tick = `<line x1="${n2(right)}" y1="${y - 7}" x2="${n2(right)}" y2="${y + 7}" class="axis" stroke-width="1.5"/>`
  return text(grid ? x + w / 2 : left, grid ? 14 : 28, 'lbl', 'LAST 30 DAYS', grid ? 'middle' : 'start') +
    `<line x1="${n2(left)}" y1="${y}" x2="${n2(right)}" y2="${y}" class="axis" stroke-width="1.5"/>` + tick + dots +
    text(grid ? x + w / 2 : left, grid ? 79 : 70, 'sub', note, grid ? 'middle' : 'start')
}

export function memoryCluster(f: MemoryFigures, columns: number): string {
  const width = columnsToPx(columns)
  const loadedNote = f.loadedAt ?? 'not loaded yet'
  const inferred = `${Math.max(0, f.active - f.yours)} inferred`
  if (columns < GRID_BELOW_COLUMNS) {
    const half = width / 2
    return svg(width, 184, 'grid',
      gauge(0, half, true, 'LOADED', f.loaded, f.active, loadedNote) +
      gauge(half, half, true, 'YOUR WORDS', f.yours, f.active, inferred) +
      `<g transform="translate(0 92)">${timeline(0, half, true, f)}${waitingCell(half, half, true, f.waiting)}</g>`)
  }
  const gaugeW = 150
  const waitW = 100
  const rule = (x: number) => `<line x1="${n2(x)}" y1="18" x2="${n2(x)}" y2="72" class="axis" stroke-width="1"/>`
  return svg(width, 88, 'row',
    rule(gaugeW - 8) + rule(2 * gaugeW) + rule(width - waitW - 12) +
    gauge(0, gaugeW, false, 'LOADED', f.loaded, f.active, loadedNote) +
    gauge(gaugeW, gaugeW, false, 'YOUR WORDS', f.yours, f.active, inferred) +
    timeline(2 * gaugeW + 12, width - 2 * gaugeW - waitW - 24, false, f) +
    waitingCell(width - waitW, waitW, false, f.waiting))
}

export function reviewCluster(f: { waiting: number; done: number }, columns: number): string {
  const width = columnsToPx(columns)
  const half = Math.min(150, width / 2)
  const done = f.done > 0
    ? `<circle cx="${n2(half + 16)}" cy="44" r="7" class="green-f"/>`
    : `<circle cx="${n2(half + 16)}" cy="44" r="7" class="off-f"/>`
  // no note line under the figures, so the drawing ends under them (operator's screenshot, 2026-10-15)
  return svg(width, 62, 'row',
    waitingCell(0, half, false, f.waiting) +
    done + text(half + 34, 28, 'lbl', 'DONE') + text(half + 34, 52, 'fig', String(f.done)))
}
