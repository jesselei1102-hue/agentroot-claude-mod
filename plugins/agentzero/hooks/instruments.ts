// The HUD's drawings on desktop, as SVG source: pure, from plain data. As the mods people pick
// for their looks do (Savvy Progress, Claude Skins), the panes are drawn whole: a header and one
// card per row, each its own SVG with its own type; native elements only for what is pressed.
// Each drawing is laid out at a design width and scaled to the pane (width 100%, never
// stretched), and picks its light or dark palette itself (the app's theme can be "auto").

// Measured from the operator's screenshots: 7 drew everything about 1.3 times too large.
const PX_PER_COLUMN = 8.8
const MIN_W = 240
const MAX_W = 1300
const DAYS = 30
const FONT = `-apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, system-ui, sans-serif`

export function designWidth(columns: number): number {
  return Math.min(MAX_W, Math.max(MIN_W, Math.round(columns * PX_PER_COLUMN)))
}

export function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]!)
}

const n2 = (v: number) => String(Math.round(v * 100) / 100)

// An estimate of the system font's advance widths, enough to cut a line before it overflows.
function charWidth(ch: string): number {
  const c = ch.codePointAt(0) ?? 0
  if (c >= 0x2e80) return 1
  if (ch === ' ') return 0.28
  if ('iljI.,:;\'|!`'.includes(ch)) return 0.3
  if ('mwMW@'.includes(ch)) return 0.85
  if (ch >= 'A' && ch <= 'Z') return 0.66
  return 0.56
}

export function textWidth(s: string, size: number): number {
  return Array.from(s).reduce((w, ch) => w + charWidth(ch) * size, 0)
}

export function fitText(s: string, size: number, maxW: number): string {
  if (textWidth(s, size) <= maxW) return s
  let out = ''
  const room = maxW - textWidth('…', size)
  for (const ch of Array.from(s)) {
    if (textWidth(out + ch, size) > room) break
    out += ch
  }
  return out.trimEnd() + '…'
}

// Today at the right edge, 30 days and older at the left.
export function dotX(days: number, left: number, right: number): number {
  const d = Math.min(DAYS, Math.max(0, days))
  return right - (d / DAYS) * (right - left)
}

// The terminal's gauge, in text.
export function textGauge(n: number, of: number, cells = 5): string {
  const lit = of > 0 ? Math.min(cells, Math.max(n > 0 ? 1 : 0, Math.round((n / of) * cells))) : 0
  return '▰'.repeat(lit) + '▱'.repeat(cells - lit)
}

// One meaning per colour: blue loaded, amber waiting, green done, red failed; the rest is ink and grey.
const STYLE = `<style>
text{font-family:${FONT};font-variant-numeric:tabular-nums}
.ink{fill:#16171a}.ink2{fill:#3a3c42}.mute{fill:#8a8d95}.faint{fill:#c4c6cc}
.over{fill:#8a8d95;font-weight:600;letter-spacing:.09em}
.hair{fill:#eceef1}.hair-s{stroke:#eceef1}.faint-s{stroke:#c4c6cc}.tint{fill:#f6f7f9}.bg{fill:#ffffff}
.blue{fill:#3366f0}.blue-s{stroke:#3366f0}.blue-t{fill:#eaf0ff}
.amber{fill:#e09a1f}.amber-t{fill:#fff1d6}.green{fill:#1f9d61}.red{fill:#d4493b}.claude{fill:#d97757}
.cell{fill:#eceef1}.cell.on{fill:#3366f0}
.rail{fill:#e3e5e9}.rail.on{fill:#3366f0}.rail.amber{fill:#e09a1f}.rail.green{fill:#1f9d61}.rail.red{fill:#d4493b}
@media (prefers-color-scheme: dark){
.ink{fill:#f1f2f4}.ink2{fill:#c9cbd0}.mute,.over{fill:#8d9099}.faint{fill:#4a4c53}
.hair,.cell,.rail{fill:#2e3035}.hair-s{stroke:#2e3035}.faint-s{stroke:#4a4c53}.tint{fill:#24262a}.bg{fill:#1c1d20}
.blue,.cell.on,.rail.on{fill:#7fa2ff}.blue-s{stroke:#7fa2ff}.blue-t{fill:#23304f}
.amber,.rail.amber{fill:#f2b34a}.amber-t{fill:#3a2f1c}.green,.rail.green{fill:#4cc98c}.red,.rail.red{fill:#f07a6e}
}
</style>`

export type Drawing = { svg: string; height: number; width?: number }

function drawing(w: number, h: number, body: string): Drawing {
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 ${w} ${h}">${STYLE}${body}</svg>`, height: h }
}

type TextOpts = { cls: string; size: number; weight?: number; anchor?: 'start' | 'middle' | 'end'; extra?: string }
const text = (x: number, y: number, s: string, o: TextOpts) =>
  `<text x="${n2(x)}" y="${n2(y)}" class="${o.cls}" font-size="${o.size}"${o.weight !== undefined ? ` font-weight="${o.weight}"` : ''}${o.anchor !== undefined ? ` text-anchor="${o.anchor}"` : ''}${o.extra ?? ''}>${escapeXml(s)}</text>`

const QUOTE = (x: number, y: number, cls: string) =>
  `<path class="${cls}" transform="translate(${n2(x)} ${n2(y)}) scale(0.92)" d="M1 7.2C1 4.6 2.4 2.7 4.6 2l.4.9C3.7 3.5 3.1 4.4 3 5.5h1.8V10H1zm6 0C7 4.6 8.4 2.7 10.6 2l.4.9C9.7 3.5 9.1 4.4 9 5.5h1.8V10H7z"/>`

function pill(x: number, y: number, label: string, fill: string, ink: string): { svg: string; w: number } {
  const w = Math.round(textWidth(label, 10.5) + 14)
  return {
    svg: `<rect x="${n2(x)}" y="${n2(y - 11)}" width="${w}" height="15" rx="7.5" class="${fill}"/>` +
      text(x + w / 2, y, label, { cls: ink, size: 10.5, weight: 600, anchor: 'middle' }),
    w,
  }
}

export type Dot = { days: number; loaded: boolean; title: string }
export type Note = { text: string; failed: boolean }
export type MemoryHeaderData = {
  loaded: number
  active: number
  yours: number
  waiting: number
  newest: string | null
  hotSet: Note | null
  dots: Dot[]
}

const MAX_CELLS = 12

function cells(loaded: number, active: number, right: number, baseline: number, room: number): string {
  if (active === 0) return ''
  const n = Math.min(MAX_CELLS, active)
  const lit = active <= MAX_CELLS ? loaded : Math.round((loaded / active) * MAX_CELLS)
  const gap = 4
  const w = Math.max(4, Math.min(14, (room + gap) / n - gap))
  const h = 22
  const x0 = right - n * (w + gap) + gap
  return Array.from({ length: n }, (_, i) =>
    `<rect x="${n2(x0 + i * (w + gap))}" y="${baseline - h}" width="${n2(w)}" height="${h}" rx="4" class="${i < lit ? 'cell on' : 'cell'}"/>`).join('')
}

function tile(x: number, y: number, w: number, label: string, body: string): string {
  return `<rect x="${n2(x)}" y="${y}" width="${n2(w)}" height="60" rx="10" class="tint"/>` +
    text(x + 12, y + 20, label, { cls: 'over', size: 10.5 }) + body
}

function timeline(w: number, top: number, dots: Dot[]): string {
  const left = 6
  const right = w - 6
  const axis = top + 22
  const ticks = [0, 7, 14, 21, 28].map(d => {
    const x = dotX(d, left, right)
    return `<line x1="${n2(x)}" y1="${axis - 3}" x2="${n2(x)}" y2="${axis + 3}" class="faint-s" stroke-width="1"/>`
  }).join('')
  const marks = dots.map(d => {
    const x = n2(dotX(d.days, left, right))
    const title = `<title>${escapeXml(d.title)}</title>`
    return d.loaded
      ? `<g><line x1="${x}" y1="${axis}" x2="${x}" y2="${axis - 14}" class="blue-s" stroke-width="2" stroke-linecap="round"/><circle cx="${x}" cy="${axis - 14}" r="3.5" class="blue"/>${title}</g>`
      : `<g><line x1="${x}" y1="${axis}" x2="${x}" y2="${axis - 9}" class="faint-s" stroke-width="2" stroke-linecap="round"/><circle cx="${x}" cy="${axis - 9}" r="3" class="bg faint-s" stroke-width="1.5"/>${title}</g>`
  }).join('')
  const labels: [number, string][] = [[28, '30 days'], [21, '3 weeks'], [14, '2'], [7, '1'], [0, 'Today']]
  return `<line x1="${left}" y1="${axis}" x2="${right}" y2="${axis}" class="hair-s" stroke-width="2" stroke-linecap="round"/>` + ticks + marks +
    labels.map(([d, s], i) => {
      const first = i === 0
      const last = i === labels.length - 1
      return text(first ? left : last ? right : dotX(d, left, right), axis + 17, s, { cls: 'mute', size: 11, anchor: first ? 'start' : last ? 'end' : 'middle' })
    }).join('')
}

export function memoryHeader(f: MemoryHeaderData, w: number): Drawing {
  const big = String(f.loaded)
  const bigW = textWidth(big, 40) * 1.05
  const rest = `of ${f.active} loaded`
  const sub = f.hotSet === null ? 'No hot set loaded yet' : f.hotSet.failed ? `Hot set ${f.hotSet.text}` : `Hot set loaded ${f.hotSet.text}`
  const heroRight = bigW + 8 + textWidth(rest, 15)
  const top = 104
  const tileW = (w - 16) / 3
  const share = f.active > 0 ? f.yours / f.active : 0
  const yours = text(12, top + 44, String(f.yours), { cls: 'ink', size: 20, weight: 650 }) +
    text(12 + textWidth(String(f.yours), 20) + 6, top + 44, `/ ${f.active}`, { cls: 'mute', size: 12 }) +
    `<rect x="12" y="${top + 50}" width="${n2(tileW - 24)}" height="4" rx="2" class="hair"/>` +
    (share > 0 ? `<rect x="12" y="${top + 50}" width="${n2((tileW - 24) * share)}" height="4" rx="2" class="ink2"/>` : '')
  const waitX = tileW + 8
  const waiting = f.waiting > 0
    ? `<circle cx="${n2(waitX + 18)}" cy="${top + 37}" r="8" class="amber-t"/><circle cx="${n2(waitX + 18)}" cy="${top + 37}" r="4" class="amber"/>` +
      text(waitX + 32, top + 44, String(f.waiting), { cls: 'amber', size: 20, weight: 650 })
    : text(waitX + 12, top + 44, '0', { cls: 'mute', size: 20, weight: 650 })
  const newX = 2 * (tileW + 8)
  return drawing(w, 230,
    text(0, 14, 'MEMORY IN THIS CONVERSATION', { cls: 'over', size: 10.5 }) +
    text(0, 62, big, { cls: 'ink', size: 40, weight: 650, extra: ' letter-spacing="-0.8"' }) +
    text(bigW + 8, 62, rest, { cls: 'mute', size: 15, weight: 500 }) +
    text(0, 84, sub, { cls: f.hotSet?.failed === true ? 'red' : 'mute', size: 12.5 }) +
    cells(f.loaded, f.active, w, 62, Math.max(0, w - heroRight - 20)) +
    tile(0, top, tileW, 'YOUR WORDS', yours) +
    tile(waitX, top, tileW, 'WAITING', waiting) +
    tile(newX, top, tileW, 'NEWEST', text(newX + 12, top + 44, f.newest ?? '—', { cls: 'ink', size: 20, weight: 650 })) +
    timeline(w, 176, f.dots))
}

export function groupHeader(label: string, count: number, w: number, note: Note | null = null): Drawing {
  const up = label.toUpperCase()
  const x = textWidth(up, 10.5) * 1.12 + 8
  const chip = pill(x, 21, String(count), 'tint', 'mute')
  return drawing(w, 30,
    text(0, 21, up, { cls: 'over', size: 10.5 }) + chip.svg +
    (note !== null ? text(w, 21, note.text, { cls: note.failed ? 'red' : 'mute', size: 11.5, anchor: 'end' }) : ''))
}

export type FactCardData = {
  sentence: string
  loaded: boolean
  state: 'active' | 'failed' | 'forgotten'
  yours: boolean
  age: string | null
  task: boolean
  updated: boolean
  quote: string | null
  replaces: string | null
  message: string | null
  cited: string | null
}

// Room kept at a card's right for the native button laid over it.
const BUTTON_ROOM = 110

// A Fact as a card: its rail (blue when loaded), the sentence, then one line: who said it, how
// old it is, and pills. Hovered, the card is tinted and the line shows the operator's words.
export function factCard(c: FactCardData, w: number, hovered: boolean): Drawing {
  const gone = c.state === 'forgotten'
  const extra = c.cited !== null ? 18 : 0
  const h = 58 + extra
  const textX = 17
  const room = w - textX - (hovered || gone || c.state === 'failed' ? BUTTON_ROOM : 12)
  const rail = gone ? 'rail' : c.state === 'failed' ? 'rail red' : c.loaded ? 'rail on' : 'rail'
  let line: string
  if ((c.state === 'failed' || gone) && c.message !== null) {
    line = text(textX, 45, fitText(c.message, 12, room), { cls: 'red', size: 12 })
  } else if (gone) {
    line = text(textX, 45, 'Forgotten · Restore brings it back', { cls: 'mute', size: 12 })
  } else if (hovered) {
    const words = c.quote !== null ? `“${c.quote}”` : 'Inferred by the assistant, kept by you'
    const said = c.replaces !== null ? `${words} · replaced “${c.replaces}”` : words
    line = text(textX, 45, fitText(said, 12, room), { cls: 'ink2', size: 12 })
  } else {
    let x = textX
    let parts = ''
    if (c.yours) {
      parts += QUOTE(x, 36, 'mute')
      x += 14
      parts += text(x, 45, 'Your words', { cls: 'mute', size: 12 })
      x += textWidth('Your words', 12) + 4
    } else {
      const p = pill(x, 45, 'Inferred', 'tint', 'mute')
      parts += p.svg
      x += p.w + 6
    }
    const tail = [c.age, c.task ? 'this task' : null].filter((s): s is string => s !== null && s !== '—')
    if (tail.length > 0) {
      const s = `· ${tail.join(' · ')}`
      parts += text(x, 45, s, { cls: 'mute', size: 12 })
      x += textWidth(s, 12) + 8
    }
    if (c.updated) parts += pill(x, 45, 'Updated', 'blue-t', 'blue').svg
    line = parts
  }
  return drawing(w, h,
    (hovered ? `<rect x="0" y="0" width="${w}" height="${h}" rx="10" class="tint"/>` : '') +
    `<rect x="2" y="10" width="3" height="${38 + extra}" rx="1.5" class="${rail}"/>` +
    text(textX, 26, fitText(c.sentence, 14, room), { cls: gone ? 'mute' : 'ink', size: 14, weight: 500, extra: gone ? ' text-decoration="line-through"' : '' }) +
    line +
    (c.cited !== null ? text(textX, 63, fitText(c.cited, 12, w - textX - 12), { cls: 'amber', size: 12 }) : ''))
}

export function reviewHeader(f: { waiting: number; done: number }, w: number): Drawing {
  const big = String(f.waiting)
  const bigW = textWidth(big, 40) * 1.05
  return drawing(w, 96,
    text(0, 14, 'WAITING FOR YOUR YES', { cls: 'over', size: 10.5 }) +
    text(0, 62, big, { cls: f.waiting > 0 ? 'amber' : 'ink', size: 40, weight: 650, extra: ' letter-spacing="-0.8"' }) +
    text(bigW + 8, 62, f.waiting === 1 ? 'item' : 'items', { cls: 'mute', size: 15, weight: 500 }) +
    text(0, 84, f.done > 0 ? `${f.done} decided in this pane` : 'Keep what is right; reject the rest', { cls: f.done > 0 ? 'green' : 'mute', size: 12.5 }))
}

export type ItemCardData = { sentence: string; state: 'open' | 'kept' | 'rejected' | 'failed'; meta: string; message: string | null }

// Room kept at an open item's right for the Keep and Reject pills.
const DECIDE_ROOM = 190

export function itemCard(c: ItemCardData, w: number): Drawing {
  const textX = 17
  const room = w - textX - (c.state === 'open' || c.state === 'failed' ? DECIDE_ROOM : 12)
  const rail = c.state === 'open' ? 'rail amber' : c.state === 'kept' ? 'rail green' : c.state === 'failed' ? 'rail red' : 'rail'
  const struck = c.state === 'rejected'
  const status = c.state === 'kept' ? ' · Kept' : struck ? ' · Rejected' : ''
  const line = c.state === 'failed' && c.message !== null
    ? text(textX, 45, fitText(c.message, 12, room), { cls: 'red', size: 12 })
    : text(textX, 45, fitText(c.meta + status, 12, room), { cls: c.state === 'kept' ? 'green' : 'mute', size: 12 })
  return drawing(w, 58,
    `<rect x="2" y="10" width="3" height="38" rx="1.5" class="${rail}"/>` +
    `<text x="${textX}" y="26" class="${struck ? 'mute' : 'ink'} s" font-size="14" font-weight="500"${struck ? ' text-decoration="line-through"' : ''}>${escapeXml(fitText(c.sentence, 14, room))}</text>` +
    line)
}

export type BandData = { loaded: number; active: number; yours: number; waiting: number; context: number | null; failed: string | null }

// The band is drawn at its own width and 1:1 (no scaling to a slot), so it keeps the size of the
// buttons beside it and is never cut; the context goes only when it fits within maxW.
export function bandSvg(b: BandData, maxW: number): Drawing {
  const y = 19
  let x = 0
  let s = `<rect x="2" y="${y - 10}" width="9" height="9" rx="1.5" transform="rotate(45 6.5 ${y - 5.5})" class="claude"/>`
  x += 18
  s += text(x, y, 'AgentZero', { cls: 'ink', size: 13, weight: 650 })
  x += textWidth('AgentZero', 13) * 1.05 + 16
  if (b.failed !== null) {
    const msg = `hot set not loaded (${b.failed})`
    s += `<circle cx="${n2(x + 4)}" cy="${y - 4.5}" r="4" class="red"/>` + text(x + 13, y, msg, { cls: 'red', size: 13 })
    x += 13 + textWidth(msg, 13) + 16
  } else {
    const msg = `${b.loaded}/${b.active} loaded`
    s += `<circle cx="${n2(x + 4)}" cy="${y - 4.5}" r="4" class="blue"/>` + text(x + 13, y, msg, { cls: 'blue', size: 13, weight: 500 })
    x += 13 + textWidth(msg, 13) + 16
  }
  const yours = `${b.yours}/${b.active} yours`
  s += QUOTE(x, y - 10, 'mute') + text(x + 14, y, yours, { cls: 'ink2', size: 13 })
  x += 14 + textWidth(yours, 13) + 16
  if (b.waiting > 0) {
    const msg = `${b.waiting} waiting`
    s += `<circle cx="${n2(x + 5)}" cy="${y - 4.5}" r="7" class="amber-t"/><circle cx="${n2(x + 5)}" cy="${y - 4.5}" r="3.5" class="amber"/>` +
      text(x + 15, y, msg, { cls: 'amber', size: 13, weight: 500 })
    x += 15 + textWidth(msg, 13) + 16
  }
  if (b.context !== null) {
    const warn = b.context >= 80
    const barW = 56
    const label = `context ${Math.round(b.context)}%${warn ? ' · reloads after compaction' : ''}`
    const end = x + barW + 8 + textWidth(label, 12.5)
    if (end <= maxW) {
      const lit = Math.max(b.context > 0 ? 3 : 0, (Math.min(100, b.context) / 100) * barW)
      s += `<rect x="${n2(x)}" y="${y - 7}" width="${barW}" height="5" rx="2.5" class="hair"/>` +
        (lit > 0 ? `<rect x="${n2(x)}" y="${y - 7}" width="${n2(lit)}" height="5" rx="2.5" class="${warn ? 'amber' : 'blue'}"/>` : '') +
        text(x + barW + 8, y, label, { cls: warn ? 'amber' : 'mute', size: 12.5 })
      x = end + 16
    }
  }
  const width = Math.ceil(x - 16 + 4)
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="28" viewBox="0 0 ${width} 28">${STYLE}${s}</svg>`, height: 28, width }
}
