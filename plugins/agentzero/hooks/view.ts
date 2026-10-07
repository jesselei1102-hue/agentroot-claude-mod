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

// The dim line under a Fact: its words, its date, and whether the hot set holds it.
export function factMeta(row: MemoryRow): Segment[] {
  const f = row.fact
  const parts: Segment[] = [{ text: f.said !== null ? `“${f.said}”` : 'Inferred by the assistant, kept by you' }]
  const date = shortDate(f.createdAt)
  if (date !== null) parts.push({ text: date })
  if (f.inHotSet && row.state !== 'forgotten') parts.push({ text: 'in hot set', color: 'suggestion' })
  if (f.scope === 'task') parts.push({ text: 'task' })
  return parts.flatMap((p, i) => (i === 0 ? [p] : [{ text: ' · ' }, p]))
}

export function reviewMeta(item: PendingItem): string {
  const date = shortDate(item.createdAt)
  return date !== null ? `${item.provenance} · ${date}` : item.provenance
}
