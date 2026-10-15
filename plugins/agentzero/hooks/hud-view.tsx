import type { Fact, PendingItem } from '../types'
import type { BandModel, PillTone } from './band'
import type { MemoryRow } from './memory'
import { columnsToPx, doneSvg, lightSvg, ringSvg, stripSvg, textGauge, type MemoryFigures } from './instruments'
import { KIND_LABEL, type PaneRow } from './pane'
import { DAY, age, displayWidth, factDetail, metaLine, themeOf } from './view'

// The HUD's trees, from plain data: no `$` here, so a preview mod can draw them with fixtures.
// One type and one left edge: every word is the app's own Text; SVG draws only small graphics
// (rings, a light, the 30-day strip) beside it. A row is its sentence and one light line.

export type El = (props: Record<string, unknown>) => never
export type Els = { Box: El; Text: El; Button: El; Svg?: El }
export type ViewCtx = { surface: 'terminal' | 'desktop' | 'vscode' | 'mobile'; columns: number; now: number }

// Hover needs a pointer: desktop and VS Code have one; the terminal and the phone show details plainly.
const hovers = (ctx: ViewCtx) => ctx.surface === 'desktop' || ctx.surface === 'vscode'
const drawsSvg = (els: Els, ctx: ViewCtx) => els.Svg !== undefined && ctx.surface !== 'terminal'

// A tone as Text props: a theme key, dim for grey, nothing for ink.
export function toned(tone: PillTone): Record<string, unknown> {
  const color = themeOf(tone)
  if (color !== undefined) return { color }
  return tone === 'grey' ? { dimColor: true } : {}
}

type Note = { text: string; failed: boolean }

function section({ Box, Text }: Els, title: string, count: number, note: Note | null = null) {
  return (
    <Box flexDirection="row" marginTop={1} justifyContent="space-between">
      <Box flexDirection="row">
        <Text dimColor={true}>{`${title} · ${count}`}</Text>
      </Box>
      {note !== null && (note.failed ? <Text color="error">{note.text}</Text> : <Text dimColor={true}>{note.text}</Text>)}
    </Box>
  )
}

type Mark = { glyph: string; tone: PillTone }

// rows are what the pane lists (capped, with rows a press left behind); facts are the snapshot's
// Facts still active, which every figure counts, as the band does.
export type MemoryView = {
  rows: MemoryRow[]
  facts: Fact[]
  active: number
  waiting: number
  hidden: number
  hotSet: Note | null
}

export type MemoryActions = { forget: (fact: Fact) => unknown; restore: (fact: Fact) => unknown }

function factMark(r: MemoryRow): Mark {
  if (r.state === 'forgotten') return { glyph: '×', tone: 'grey' }
  if (r.state === 'failed') return { glyph: '!', tone: 'red' }
  return r.fact.inHotSet ? { glyph: '•', tone: 'blue' } : { glyph: '◦', tone: 'grey' }
}

const cited = (skills: string[]) =>
  skills.length === 1
    ? `Cited by skill ${skills[0]}, which needs a new version`
    : `Cited by skills ${skills.join(', ')}, which need new versions`

// Room the sentence has on its line: the pane less the mark and its gap.
const sentenceRoom = (ctx: ViewCtx) => ctx.columns - 4

// A row's mark, in a narrow column of its own so every sentence starts on one edge.
function marked({ Box, Text }: Els, mark: Mark) {
  return (
    <Box width={2} flexShrink={0}>
      <Text {...toned(mark.tone)}>{mark.glyph}</Text>
    </Box>
  )
}

function factRow(els: Els, r: MemoryRow, act: MemoryActions, ctx: ViewCtx) {
  const { Box, Text, Button } = els
  const id = r.fact.id
  const gone = r.state === 'forgotten'
  const detail = [
    ...(displayWidth(r.fact.sentence) > sentenceRoom(ctx) ? [r.fact.sentence] : []),
    ...factDetail(r),
  ]
  // A failed row keeps its Forget in sight; a quiet row shows it on hover.
  const hidden = hovers(ctx) && r.state === 'active' ? { display: 'none', hover: { display: 'flex' } } : {}
  return (
    <Box key={`az-row-${id}`} flexDirection="row" gap={1}>
      {marked(els, factMark(r))}
      <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
        <Box flexDirection="row" gap={2}>
          <Box flexGrow={1} flexShrink={1} minWidth={0}>
            <Text wrap="truncate-end" strikethrough={gone} dimColor={gone}>{r.fact.sentence}</Text>
          </Box>
          {gone && <Button key={`az-restore-${id}`} label="Restore" plain={true} dimColor={true} onPress={() => act.restore(r.fact)} />}
        </Box>
        {!gone && (
          <Box flexDirection="row" flexShrink={1} minWidth={0}>
            <Text dimColor={true} wrap="truncate-end">{metaLine(r.fact, ctx.now)}</Text>
            {r.fact.replaces !== null && <Text color="suggestion">{' · updated'}</Text>}
          </Box>
        )}
        {!gone && (
          <Box flexDirection="row" gap={2} {...hidden}>
            <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
              {detail.map(line => <Text dimColor={true} wrap="wrap">{line}</Text>)}
            </Box>
            {r.actionable && <Button key={`az-forget-${id}`} label="Forget" plain={true} dimColor={true} onPress={() => act.forget(r.fact)} />}
          </Box>
        )}
        {(r.state === 'failed' || gone) && r.message !== null && <Text color="error">{r.message}</Text>}
        {r.citedBy.length > 0 && <Text color="warning">{cited(r.citedBy)}</Text>}
      </Box>
    </Box>
  )
}

export function memoryFigures(v: MemoryView, now: number): MemoryFigures {
  const dated = v.facts.filter(f => f.createdAt !== null && !Number.isNaN(Date.parse(f.createdAt)))
  return {
    loaded: v.facts.filter(f => f.inHotSet).length,
    active: v.active,
    yours: v.facts.filter(f => f.said !== null).length,
    waiting: v.waiting,
    dots: dated.map(f => ({ days: (now - Date.parse(f.createdAt!)) / DAY, loaded: f.inHotSet, title: f.sentence })),
  }
}

type Stat = { label: string; graphic: string; alt: string; n: number; of: number | null; tone: PillTone }

// A figure: its graphic, then its label over its number, both the app's own Text.
function stat(els: Els, s: Stat) {
  const { Box, Text } = els
  const Svg = els.Svg!
  return (
    <Box key={`az-stat-${s.label}`} flexDirection="row" gap={1} alignItems="center">
      <Svg source={s.graphic} alt={s.alt} width={32} height={32} />
      <Box flexDirection="column">
        <Text dimColor={true}>{s.label}</Text>
        <Box flexDirection="row">
          <Text bold={true} {...toned(s.tone)}>{String(s.n)}</Text>
          {s.of !== null && <Text dimColor={true}>{` of ${s.of}`}</Text>}
        </Box>
      </Box>
    </Box>
  )
}

function stats(els: Els, items: Stat[]) {
  const { Box } = els
  return <Box flexDirection="row" flexWrap="wrap" columnGap={4} rowGap={1}>{items.map(s => stat(els, s))}</Box>
}

function memoryInstruments(els: Els, v: MemoryView, ctx: ViewCtx) {
  const f = memoryFigures(v, ctx.now)
  const { Box, Text } = els
  if (!drawsSvg(els, ctx)) {
    return <Text dimColor={true}>{`LOADED ${textGauge(f.loaded, f.active)} ${f.loaded}/${f.active}   YOURS ${textGauge(f.yours, f.active)} ${f.yours}/${f.active}   WAITING ${f.waiting}`}</Text>
  }
  const Svg = els.Svg!
  return (
    <Box flexDirection="column" gap={1}>
      {stats(els, [
        { label: 'Loaded', graphic: ringSvg(f.loaded, f.active), alt: `${f.loaded} of ${f.active} loaded`, n: f.loaded, of: f.active, tone: 'ink' },
        { label: 'Your words', graphic: ringSvg(f.yours, f.active), alt: `${f.yours} of ${f.active} in your words`, n: f.yours, of: f.active, tone: 'ink' },
        { label: 'Waiting', graphic: lightSvg(f.waiting), alt: `${f.waiting} waiting`, n: f.waiting, of: null, tone: f.waiting > 0 ? 'amber' : 'ink' },
      ])}
      <Box flexDirection="column">
        <Svg source={stripSvg(f.dots, ctx.columns)} alt="When each Fact was said, over the last 30 days" isInteractive={true} width={columnsToPx(ctx.columns)} height={18} />
        <Box flexDirection="row" justifyContent="space-between">
          <Text dimColor={true}>30 days ago</Text>
          <Text dimColor={true}>today</Text>
        </Box>
      </Box>
    </Box>
  )
}

export function memoryPane(els: Els, v: MemoryView, act: MemoryActions, ctx: ViewCtx) {
  const { Box, Text } = els
  const hot = v.rows.filter(r => r.state !== 'forgotten' && r.fact.inHotSet)
  const other = v.rows.filter(r => r.state !== 'forgotten' && !r.fact.inHotSet)
  const gone = v.rows.filter(r => r.state === 'forgotten')
  const group = (title: string, rows: MemoryRow[], note: Note | null = null) =>
    rows.length === 0 ? [] : [section(els, title, rows.length, note), ...rows.map(r => factRow(els, r, act, ctx))]
  return (
    <Box flexDirection="column" gap={1}>
      {memoryInstruments(els, v, ctx)}
      {group('Loaded now', hot, v.hotSet)}
      {group('Not loaded', other)}
      {group('Forgotten', gone)}
      {v.hidden > 0 && <Text dimColor={true}>{`+${v.hidden} older Facts not shown`}</Text>}
    </Box>
  )
}

export type ReviewView = { rows: PaneRow[]; open: number; done: number }
export type ReviewActions = { decide: (item: PendingItem, verb: 'keep' | 'reject') => unknown }

function reviewMark(r: PaneRow): Mark {
  if (r.state === 'kept') return { glyph: '✓', tone: 'green' }
  if (r.state === 'rejected') return { glyph: '×', tone: 'grey' }
  if (r.state === 'failed') return { glyph: '!', tone: 'red' }
  return { glyph: '•', tone: 'amber' }
}

function reviewRow(els: Els, r: PaneRow, act: ReviewActions, ctx: ViewCtx) {
  const { Box, Text, Button } = els
  const rejected = r.state === 'rejected'
  const kind = KIND_LABEL[r.item.kind] ?? r.item.kind
  const old = age(ctx.now, r.item.createdAt)
  const meta = [kind, r.item.provenance, ...(old !== '—' ? [old] : [])].join(' · ')
  return (
    <Box key={`az-item-${r.item.id}`} flexDirection="row" gap={1}>
      {marked(els, reviewMark(r))}
      <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
        <Box flexDirection="row" gap={2}>
          <Box flexGrow={1} flexShrink={1} minWidth={0}>
            <Text wrap="truncate-end" strikethrough={rejected} dimColor={rejected}>{r.item.sentence}</Text>
          </Box>
          {r.actionable && (
            <Box flexDirection="row" gap={2} flexShrink={0}>
              <Button key={`az-keep-${r.item.id}`} label="✓ Keep" plain={true} onPress={() => act.decide(r.item, 'keep')} />
              <Button key={`az-reject-${r.item.id}`} label="✗ Reject" plain={true} dimColor={true} onPress={() => act.decide(r.item, 'reject')} />
            </Box>
          )}
        </Box>
        <Box flexShrink={1} minWidth={0}>
          <Text dimColor={true} wrap="truncate-end">{meta}</Text>
        </Box>
        {r.state === 'failed' && <Text color="error">{r.message ?? ''}</Text>}
      </Box>
    </Box>
  )
}

function reviewInstruments(els: Els, v: ReviewView, ctx: ViewCtx) {
  if (!drawsSvg(els, ctx)) return <els.Text dimColor={true}>{`WAITING ${v.open}   DONE ${v.done}`}</els.Text>
  return stats(els, [
    { label: 'Waiting', graphic: lightSvg(v.open), alt: `${v.open} waiting`, n: v.open, of: null, tone: v.open > 0 ? 'amber' : 'ink' },
    { label: 'Done', graphic: doneSvg(v.done), alt: `${v.done} done`, n: v.done, of: null, tone: v.done > 0 ? 'green' : 'ink' },
  ])
}

export function reviewPane(els: Els, v: ReviewView, act: ReviewActions, ctx: ViewCtx) {
  const { Box, Text } = els
  const waiting = v.rows.filter(r => r.actionable)
  const done = v.rows.filter(r => !r.actionable)
  return (
    <Box flexDirection="column" gap={1}>
      {reviewInstruments(els, v, ctx)}
      {waiting.length > 0 && section(els, 'Waiting for you', waiting.length)}
      {waiting.map(r => reviewRow(els, r, act, ctx))}
      {done.length > 0 && section(els, 'Done', done.length)}
      {done.map(r => reviewRow(els, r, act, ctx))}
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
