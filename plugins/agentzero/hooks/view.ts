import type { PendingItem } from '../types'
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
function cutWords(s: string): string {
  const width = (ch: string) => ((ch.codePointAt(0) ?? 0) >= 0x2e80 ? 2 : 1)
  const chars = Array.from(s)
  if (chars.reduce((n, ch) => n + width(ch), 0) <= WORDS_MAX) return s
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
