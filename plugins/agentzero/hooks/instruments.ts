// The small graphics atop the Memory and Review panes, as SVG source: pure, from figures. They
// carry no text: every label and figure beside them is the app's own Text, so the pane keeps one
// type (operator, 2026-10-15). Each picks its light or dark palette itself (the theme can be "auto").

export const PX_PER_COLUMN = 5.7
const MIN_PX = 180
const DAYS = 30

export function columnsToPx(columns: number): number {
  return Math.max(MIN_PX, Math.round(columns * PX_PER_COLUMN))
}

export function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]!)
}

const n2 = (v: number) => String(Math.round(v * 100) / 100)

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
  dots: Dot[]
}

// One meaning per colour: blue loaded, amber waiting, green done, grey the rest.
const STYLE = `<style>
.track{stroke:#e6e4dd;fill:none}.lit{stroke:#2c6cd6;fill:none}.lit-f{fill:#2c6cd6}
.hollow{fill:none;stroke:#b9b7b0}.amber{fill:#c27c0e}.halo{fill:#c27c0e;opacity:.18}
.off{fill:#cfcdc6}.done{fill:#2f8a4e}
@media (prefers-color-scheme: dark){
.track{stroke:#3d3c38}.lit{stroke:#78a9ff}.lit-f{fill:#78a9ff}.hollow{stroke:#6b6a64}
.amber,.halo{fill:#f0b04a}.off{fill:#4a4944}.done{fill:#5cc28a}
}
</style>`

function svg(width: number, height: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${STYLE}${body}</svg>`
}

const RING_R = 13
const RING_C = 2 * Math.PI * RING_R

// A 32 px ring, lit clockwise from 12 o'clock by n of `of`; empty when there is nothing.
export function ringSvg(n: number, of: number): string {
  const lit = of > 0 ? Math.min(1, n / of) * RING_C : 0
  const track = `<circle cx="16" cy="16" r="${RING_R}" class="track" stroke-width="4"/>`
  // a zero-length dash with a round cap would still draw a dot at 12 o'clock
  if (lit === 0) return svg(32, 32, track)
  return svg(32, 32, track +
    `<circle cx="16" cy="16" r="${RING_R}" class="lit" stroke-width="4" stroke-linecap="round" stroke-dasharray="${n2(lit)} ${n2(RING_C)}" transform="rotate(-90 16 16)"/>`)
}

// The waiting light: amber with a soft halo when something waits, grey when nothing does.
export function lightSvg(waiting: number): string {
  if (waiting === 0) return svg(32, 32, `<circle cx="16" cy="16" r="5.5" class="off"/>`)
  return svg(32, 32, `<circle cx="16" cy="16" r="10" class="halo"/><circle cx="16" cy="16" r="5.5" class="amber"/>`)
}

export function doneSvg(done: number): string {
  return svg(32, 32, `<circle cx="16" cy="16" r="5.5" class="${done > 0 ? 'done' : 'off'}"/>`)
}

// The last 30 days at the pane's width, today at the right: a dot per Fact, filled when loaded.
export function stripSvg(dots: Dot[], columns: number): string {
  const width = columnsToPx(columns)
  const left = 6
  const right = width - 6
  const marks = dots
    .map(d => {
      const cx = n2(dotX(d.days, left, right))
      const shape = d.loaded ? `r="4.5" class="lit-f"` : `r="4" class="hollow" stroke-width="1.5"`
      return `<circle cx="${cx}" cy="9" ${shape}><title>${escapeXml(d.title)}</title></circle>`
    })
    .join('')
  return svg(width, 18, `<line x1="${left}" y1="9" x2="${right}" y2="9" class="track" stroke-width="2" stroke-linecap="round"/>${marks}`)
}
