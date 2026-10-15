import type { Fact, PendingItem } from '../types'
import type { PillTone } from './band'
import type { MemoryRow } from './memory'

// The app's theme keys, so light and dark themes both draw: one meaning each. Grey and ink
// have none: grey is drawn dim, ink plain.
const THEME: Record<PillTone, string | undefined> = {
  green: 'success',
  amber: 'warning',
  blue: 'suggestion',
  red: 'error',
  grey: undefined,
  ink: undefined,
}

export function themeOf(tone: PillTone): string | undefined {
  return THEME[tone]
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "Oct 6", from the date as written: the time zone never moves the day.
export function shortDate(iso: string | null): string | null {
  const m = iso !== null ? /^\d{4}-(\d{2})-(\d{2})/.exec(iso) : null
  if (m === null) return null
  const month = MONTHS[Number(m[1]) - 1]
  return month !== undefined ? `${month} ${Number(m[2])}` : null
}

export type Segment = { text: string; color?: string }

const WORDS_MAX = 48

// The app does not wrap a long Chinese line in a pane, so long words are cut here: a Chinese
// (or other full-width) character counts 2, any other 1, and one unit is kept for the "…".
const width = (ch: string) => ((ch.codePointAt(0) ?? 0) >= 0x2e80 ? 2 : 1)

// Columns a line takes in the pane, a full-width character counting 2.
export function displayWidth(s: string): number {
  return Array.from(s).reduce((n, ch) => n + width(ch), 0)
}

function cutWords(s: string): string {
  const chars = Array.from(s)
  if (displayWidth(s) <= WORDS_MAX) return s
  let used = 0
  let out = ''
  for (const ch of chars) {
    if (used + width(ch) > WORDS_MAX - 1) break
    used += width(ch)
    out += ch
  }
  return out.trimEnd() + '…'
}

// The line under a Fact: its words, then its date and a task tag. The hot set is its section, not a tag.
// Apart, so a long quote wraps on its own and no line starts with a stray " · ".
export function factMeta(row: MemoryRow): { words: string; tags: Segment[] } {
  const f = row.fact
  const tags: Segment[] = []
  const date = shortDate(f.createdAt)
  if (date !== null) tags.push({ text: date })
  if (f.scope === 'task') tags.push({ text: 'task' })
  return {
    words: f.said !== null ? `“${cutWords(f.said)}”` : 'Inferred by the assistant, kept by you',
    tags: tags.flatMap((t, i) => (i === 0 ? [t] : [{ text: ' · ' }, t])),
  }
}

export function reviewMeta(item: PendingItem): string {
  const date = shortDate(item.createdAt)
  return date !== null ? `${item.provenance} · ${date}` : item.provenance
}

const HOUR = 3_600_000
export const DAY = 24 * HOUR

// How old a Fact is, in one short word: now, 5h, 3d, 5w; a dash when the date is unknown.
export function age(now: number, iso: string | null): string {
  const at = iso !== null ? Date.parse(iso) : NaN
  if (Number.isNaN(at)) return '—'
  const ago = now - at
  if (ago < HOUR) return 'now'
  if (ago < DAY) return `${Math.floor(ago / HOUR)}h`
  if (ago < 14 * DAY) return `${Math.floor(ago / DAY)}d`
  return `${Math.floor(ago / (7 * DAY))}w`
}

export function sourceChip(fact: Fact): { text: '❝ yours' | '◇ inferred'; dim: boolean } {
  return fact.said !== null ? { text: '❝ yours', dim: false } : { text: '◇ inferred', dim: true }
}

// What a row shows on hover: the words whole, then the older sentence it replaced.
export function factDetail(row: MemoryRow): string[] {
  const f = row.fact
  const lines = [f.said !== null ? `“${f.said}”` : 'Inferred by the assistant, kept by you']
  if (f.replaces !== null) lines.push(`Replaced “${f.replaces}”`)
  return lines
}

// From 70 columns a row's source, age and scope sit beside its sentence; narrower, under it.
export function columnsInline(columns: number): boolean {
  return columns >= 70
}

// "14:02", the hot set's load time in the clock's own zone; null when unknown.
export function clockTime(iso: string | null): string | null {
  const at = iso !== null ? new Date(iso) : null
  if (at === null || Number.isNaN(at.getTime())) return null
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
}
