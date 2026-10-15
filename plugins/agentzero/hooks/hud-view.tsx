import type { Fact, PendingItem } from '../types'
import type { BandModel, PillTone } from './band'
import type { MemoryRow } from './memory'
import { KIND_LABEL, type PaneRow } from './pane'
import { factMeta, reviewMeta, themeOf } from './view'

// The HUD's trees, from plain data: no `$` here, so a preview mod can draw them with fixtures.
// The layout follows the mods people like to look at: a row of figures on top, sections with a
// count, one status mark per row, two lines a row, the action at the row's right.

export type El = (props: Record<string, unknown>) => never
export type Els = { Box: El; Text: El; Button: El }

// A tone as Text props: a theme key, dim for grey, nothing for ink.
export function toned(tone: PillTone): Record<string, unknown> {
  const color = themeOf(tone)
  if (color !== undefined) return { color }
  return tone === 'grey' ? { dimColor: true } : {}
}

type Stat = { label: string; value: number; tone: PillTone }

// Figures in small boxes, side by side, each as wide as the others.
function stats({ Box, Text }: Els, items: Stat[]) {
  return (
    <Box flexDirection="row" gap={1}>
      {items.map(s => (
        <Box key={`az-stat-${s.label}`} borderStyle="round" borderDimColor={true} paddingX={1} flexDirection="column" flexGrow={1}>
          <Text dimColor={true}>{s.label}</Text>
          <Text bold={true} {...toned(s.tone)}>{String(s.value)}</Text>
        </Box>
      ))}
    </Box>
  )
}

function section({ Box, Text }: Els, title: string, count: number) {
  return (
    <Box flexDirection="row" marginTop={1}>
      <Text bold={true}>{title}</Text>
      <Text dimColor={true}>{` · ${count}`}</Text>
    </Box>
  )
}

type Mark = { glyph: string; tone: PillTone }

// One row: the mark in a narrow column, then the sentence; under it a dim line and, at its
// right, the row's buttons. The dim line shrinks and is cut at its end, so a long line never
// pushes the buttons out of the pane.
function row(els: Els, mark: Mark, sentence: string, struck: boolean, meta: unknown, actions: unknown, extra: unknown[]) {
  const { Box, Text } = els
  return (
    <Box flexDirection="row" gap={1}>
      <Box width={2} flexShrink={0}>
        <Text {...toned(mark.tone)}>{mark.glyph}</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
        <Text strikethrough={struck} dimColor={struck}>{sentence}</Text>
        <Box flexDirection="row" gap={2} alignItems="center">
          <Box flexGrow={1} flexShrink={1} minWidth={0}>{meta}</Box>
          {actions}
        </Box>
        {extra}
      </Box>
    </Box>
  )
}

export type MemoryView = {
  rows: MemoryRow[]
  active: number
  inHotSet: number
  waiting: number
  hidden: number
}

export type MemoryActions = { forget: (fact: Fact) => unknown; restore: (fact: Fact) => unknown }

function factMark(r: MemoryRow): Mark {
  if (r.state === 'forgotten') return { glyph: '✕', tone: 'grey' }
  if (r.state === 'failed') return { glyph: '!', tone: 'red' }
  return r.fact.inHotSet ? { glyph: '●', tone: 'blue' } : { glyph: '○', tone: 'grey' }
}

const cited = (skills: string[]) =>
  skills.length === 1
    ? `Cited by skill ${skills[0]}, which needs a new version`
    : `Cited by skills ${skills.join(', ')}, which need new versions`

function factRow(els: Els, r: MemoryRow, act: MemoryActions) {
  const { Box, Text, Button } = els
  const id = r.fact.id
  const gone = r.state === 'forgotten'
  const meta = factMeta(r)
  const line = (
    <Box flexDirection="row" flexShrink={1} minWidth={0}>
      <Text dimColor={true} wrap="truncate-end">{meta.words}</Text>
      {meta.tags.length > 0 && <Text dimColor={true}>{' · '}</Text>}
      {meta.tags.map(seg => (seg.color !== undefined ? <Text color={seg.color}>{seg.text}</Text> : <Text dimColor={true}>{seg.text}</Text>))}
    </Box>
  )
  const actions = gone ? (
    <Button key={`az-restore-${id}`} label="Restore" plain={true} dimColor={true} onPress={() => act.restore(r.fact)} />
  ) : (
    r.actionable && <Button key={`az-forget-${id}`} label="Forget" plain={true} dimColor={true} onPress={() => act.forget(r.fact)} />
  )
  const extra = [
    (r.state === 'failed' || gone) && r.message !== null ? <Text color="error">{r.message}</Text> : null,
    r.citedBy.length > 0 ? <Text color="warning">{cited(r.citedBy)}</Text> : null,
  ]
  return row(els, factMark(r), r.fact.sentence, gone, line, actions, extra)
}

export function memoryPane(els: Els, v: MemoryView, act: MemoryActions) {
  const { Box, Text } = els
  const hot = v.rows.filter(r => r.state !== 'forgotten' && r.fact.inHotSet)
  const other = v.rows.filter(r => r.state !== 'forgotten' && !r.fact.inHotSet)
  const gone = v.rows.filter(r => r.state === 'forgotten')
  const group = (title: string, rows: MemoryRow[]) =>
    rows.length === 0 ? [] : [section(els, title, rows.length), ...rows.map(r => factRow(els, r, act))]
  return (
    <Box flexDirection="column" gap={1}>
      {stats(els, [
        { label: 'Active', value: v.active, tone: 'ink' },
        { label: 'In hot set', value: v.inHotSet, tone: v.inHotSet > 0 ? 'blue' : 'grey' },
        { label: 'Waiting', value: v.waiting, tone: v.waiting > 0 ? 'amber' : 'grey' },
      ])}
      {group('In hot set', hot)}
      {group('Other Facts', other)}
      {group('Forgotten', gone)}
      {v.hidden > 0 && <Text dimColor={true}>{`+${v.hidden} older Facts not shown`}</Text>}
    </Box>
  )
}

export type ReviewView = { rows: PaneRow[]; open: number; done: number }
export type ReviewActions = { decide: (item: PendingItem, verb: 'keep' | 'reject') => unknown }

function reviewMark(r: PaneRow): Mark {
  if (r.state === 'kept') return { glyph: '✓', tone: 'green' }
  if (r.state === 'rejected') return { glyph: '✗', tone: 'grey' }
  if (r.state === 'failed') return { glyph: '!', tone: 'red' }
  return { glyph: '○', tone: 'amber' }
}

function reviewRow(els: Els, r: PaneRow, act: ReviewActions) {
  const { Box, Text, Button } = els
  const rejected = r.state === 'rejected'
  const kind = KIND_LABEL[r.item.kind] ?? r.item.kind
  const meta = <Text dimColor={true} wrap="truncate-end">{`${kind} · ${reviewMeta(r.item)}`}</Text>
  const actions = r.actionable && (
    <Box flexDirection="row" gap={2} flexShrink={0}>
      <Button key={`az-keep-${r.item.id}`} label="✓ Keep" plain={true} onPress={() => act.decide(r.item, 'keep')} />
      <Button key={`az-reject-${r.item.id}`} label="✗ Reject" plain={true} dimColor={true} onPress={() => act.decide(r.item, 'reject')} />
    </Box>
  )
  const extra = [
    r.state === 'kept' ? <Text color="success">Kept</Text> : null,
    rejected ? <Text dimColor={true}>Rejected</Text> : null,
    r.state === 'failed' ? <Text color="error">{r.message ?? ''}</Text> : null,
  ]
  return row(els, reviewMark(r), r.item.sentence, rejected, meta, actions, extra)
}

export function reviewPane(els: Els, v: ReviewView, act: ReviewActions) {
  const { Box, Text } = els
  const waiting = v.rows.filter(r => r.actionable)
  const done = v.rows.filter(r => !r.actionable)
  return (
    <Box flexDirection="column" gap={1}>
      {stats(els, [
        { label: 'Waiting', value: v.open, tone: v.open > 0 ? 'amber' : 'grey' },
        { label: 'Done', value: v.done, tone: v.done > 0 ? 'green' : 'grey' },
      ])}
      {waiting.length > 0 && section(els, 'Waiting for you', waiting.length)}
      {waiting.map(r => reviewRow(els, r, act))}
      {done.length > 0 && section(els, 'Done', done.length)}
      {done.map(r => reviewRow(els, r, act))}
      {v.rows.length === 0 && <Text color="success">Nothing is waiting for you ✓</Text>}
    </Box>
  )
}

const BAR_CELLS = 8

// "▰▰▰▱▱▱▱▱": the context in eight cells, at least one lit once anything is used.
export function contextBar(percent: number): string {
  const lit = Math.min(BAR_CELLS, Math.max(percent > 0 ? 1 : 0, Math.round((percent / 100) * BAR_CELLS)))
  return '▰'.repeat(lit) + '▱'.repeat(BAR_CELLS - lit)
}

export type BandActions = { review: () => unknown; memory: () => unknown }

export function band(els: Els, m: BandModel, act: BandActions) {
  const { Box, Text, Button } = els
  const ring = m.ring
  return (
    <Box flexDirection="row" alignItems="center" gap={2}>
      <Box flexDirection="row" gap={1} flexShrink={0}>
        <Text color="claude">◆</Text>
        <Text bold={true}>AgentZero</Text>
      </Box>
      <Box flexDirection="row" gap={2} flexGrow={1} flexShrink={1} minWidth={0}>
        {m.pills.map(p => <Text {...toned(p.tone)} wrap="truncate-end">{p.text}</Text>)}
        {ring !== null && (
          <Box flexDirection="row" gap={1}>
            <Text color={ring.tone === 'amber' ? 'warning' : 'suggestion'}>{contextBar(ring.percent)}</Text>
            <Text {...(ring.tone === 'amber' ? { color: 'warning' } : { dimColor: true })}>
              {`context ${ring.percent}%${ring.note !== null ? ` · ${ring.note}` : ''}`}
            </Text>
          </Box>
        )}
      </Box>
      {m.showReview && <Button key="az-review" label="Review" variant="primary" onPress={act.review} />}
      {m.showMemory && <Button key="az-memory" label="Memory" onPress={act.memory} />}
    </Box>
  )
}
