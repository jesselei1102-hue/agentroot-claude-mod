import type { PaneNote } from '../types'

const FIRST = "AgentZero: since your last message, the operator changed the memory in the plugin's panes."

// What the operator changed in the panes since the last message, for the assistant; null when nothing did.
export function paneNoteText(notes: readonly PaneNote[]): string | null {
  if (notes.length === 0) return null
  const of = (verb: PaneNote['verb']) => notes.filter(n => n.verb === verb)
  const lines = [FIRST]
  const forgot = of('forgot')
  if (forgot.length > 0) lines.push(`Forgotten, stop applying: ${forgot.map(n => `"${n.sentence}"`).join('; ')}`)
  const kept = of('kept')
  if (kept.length > 0) lines.push(`Kept, now active: ${kept.map(n => `${n.kind} "${n.sentence}"`).join('; ')}`)
  const rejected = of('rejected')
  if (rejected.length > 0) lines.push(`Rejected: ${rejected.map(n => `${n.kind} "${n.sentence}"`).join('; ')}`)
  return lines.join('\n')
}
