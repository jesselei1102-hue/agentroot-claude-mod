import type { Fact } from '../types'
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

const width = (ch: string) => ((ch.codePointAt(0) ?? 0) >= 0x2e80 ? 2 : 1)

// Columns a line takes in the pane, a full-width character counting 2.
export function displayWidth(s: string): number {
  return Array.from(s).reduce((n, ch) => n + width(ch), 0)
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
