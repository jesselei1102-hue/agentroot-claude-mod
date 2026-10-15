import type { Fact, HudState } from '../types'
import type { Tone } from './cards'
import type { BandData } from './instruments'

export type PillTone = Tone | 'ink' | 'red'
export type Pill = { text: string; tone: PillTone }
export type Ring = { percent: number; tone: 'blue' | 'amber'; note: string | null }

// drawn: what the desktop draws, known only with a fact list; without one the band is text.
export type BandModel = { pills: Pill[]; ring: Ring | null; showReview: boolean; showMemory: boolean; alt: string; drawn: BandData | null }

export const CONTEXT_WARN_PERCENT = 80

function altText(snap: HudState['snapshot'], facts: Fact[] | null): string {
  if (snap === null) return 'AgentZero memory: state unknown'
  if (facts === null) return `AgentZero memory: ${snap.active} active, ${snap.pending.length} waiting`
  const loaded = facts.filter(f => f.inHotSet).length
  const yours = facts.filter(f => f.said !== null).length
  return `AgentZero memory: ${loaded} of ${facts.length} loaded, ${yours} in your words, ${snap.pending.length} waiting`
}

export function bandModel(hud: HudState, hotSetError: string | null, contextPercent: number | undefined, now: number): BandModel {
  const snap = hud.snapshot
  // The pane's figures, in brief: loaded and in the operator's words; what waits in amber.
  const pills: Pill[] = []
  const failed: Pill | null = hotSetError !== null ? { text: `hot set not loaded (${hotSetError})`, tone: 'red' } : null
  const facts = snap?.facts ?? null
  if (snap === null) {
    pills.push({ text: hud.error !== null ? 'memory unreadable' : 'reading memory…', tone: 'grey' })
    if (failed !== null) pills.push(failed)
  } else if (facts === null) {
    pills.push({ text: `${snap.active} active`, tone: 'ink' })
    if (failed !== null) pills.push(failed)
  } else {
    const loaded = facts.filter(f => f.inHotSet).length
    pills.push(failed ?? { text: `● ${loaded}/${facts.length} loaded`, tone: 'blue' })
    pills.push({ text: `❝ ${facts.filter(f => f.said !== null).length}/${facts.length} yours`, tone: 'ink' })
  }
  if (snap !== null && snap.pending.length > 0) pills.push({ text: `◉ ${snap.pending.length} waiting`, tone: 'amber' })

  let ring: Ring | null = null
  if (contextPercent !== undefined) {
    const percent = Math.round(contextPercent)
    const warn = percent >= CONTEXT_WARN_PERCENT
    ring = { percent, tone: warn ? 'amber' : 'blue', note: warn ? 'reloads after compaction' : null }
  }
  return {
    pills,
    ring,
    showReview: snap !== null && snap.pending.length > 0,
    showMemory: snap !== null,
    alt: altText(snap, facts),
    drawn: snap !== null && facts !== null
      ? {
          loaded: facts.filter(f => f.inHotSet).length,
          active: facts.length,
          yours: facts.filter(f => f.said !== null).length,
          waiting: snap.pending.length,
          context: ring?.percent ?? null,
          failed: hotSetError,
        }
      : null,
  }
}
