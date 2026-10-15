import type { Fact, PendingItem } from '../types'
import type { BandModel, PillTone } from './band'
import type { MemoryRow } from './memory'
import { columnsToPx, memoryCluster, reviewCluster, textGauge, type MemoryFigures } from './instruments'
import { KIND_LABEL, type PaneRow } from './pane'
import { DAY, age, columnsInline, displayWidth, factDetail, sourceChip, themeOf } from './view'

// The HUD's trees, from plain data: no `$` here, so a preview mod can draw them with fixtures.
// The layout follows the mods people like to look at: a row of figures on top, sections with a
// count, one status mark per row, two lines a row, the action at the row's right.

export type El = (props: Record<string, unknown>) => never
export type Els = { Box: El; Text: El; Button: El; Svg?: El }
export type ViewCtx = { surface: 'terminal' | 'desktop' | 'vscode' | 'mobile'; columns: number; now: number }

// Hover reveals a row's details where the surface has a pointer; the terminal shows them always.
const hovers = (ctx: ViewCtx) => ctx.surface !== 'terminal'
const drawsSvg = (els: Els, ctx: ViewCtx) => els.Svg !== undefined && ctx.surface !== 'terminal'

// A tone as Text props: a theme key, dim for grey, nothing for ink.
export function toned(tone: PillTone): Record<string, unknown> {
  const color = themeOf(tone)
  if (color !== undefined) return { color }
  return tone === 'grey' ? { dimColor: true } : {}
}

function section({ Box, Text }: Els, title: string, count: number, note: string | null = null) {
  return (
    <Box flexDirection="row" marginTop={1} justifyContent="space-between">
      <Box flexDirection="row">
        <Text bold={true} dimColor={true}>{title}</Text>
        <Text dimColor={true}>{` · ${count}`}</Text>
      </Box>
      {note !== null && <Text dimColor={true}>{note}</Text>}
    </Box>
  )
}

type Mark = { glyph: string; tone: PillTone }

export type MemoryView = {
  rows: MemoryRow[]
  active: number
  inHotSet: number
  waiting: number
  hidden: number
  loadedAt: string | null
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

// The trust columns: who said it, how old it is, where it holds, and ↺ when it replaced an older one.
function trustColumns({ Box, Text }: Els, r: MemoryRow, ctx: ViewCtx) {
  const chip = sourceChip(r.fact)
  return (
    <Box flexDirection="row" gap={2} flexShrink={0}>
      <Text dimColor={chip.dim}>{chip.text}</Text>
      <Text dimColor={true}>{age(ctx.now, r.fact.createdAt)}</Text>
      <Text dimColor={true}>{r.fact.scope}</Text>
      {r.fact.replaces !== null && <Text color="suggestion">↺</Text>}
    </Box>
  )
}

// Room the sentence has on its line: the mark, the gap and, when inline, the trust columns.
const sentenceRoom = (ctx: ViewCtx) => ctx.columns - (columnsInline(ctx.columns) ? 38 : 6)

function factRow(els: Els, r: MemoryRow, act: MemoryActions, ctx: ViewCtx) {
  const { Box, Text, Button } = els
  const id = r.fact.id
  const gone = r.state === 'forgotten'
  const inline = columnsInline(ctx.columns)
  const mark = factMark(r)
  const detail = [
    ...(displayWidth(r.fact.sentence) > sentenceRoom(ctx) ? [r.fact.sentence] : []),
    ...factDetail(r),
  ]
  // A failed row keeps its Forget in sight; a quiet row shows it on hover.
  const hidden = hovers(ctx) && r.state === 'active' ? { display: 'none', hover: { display: 'flex' } } : {}
  return (
    <Box key={`az-row-${id}`} flexDirection="column">
      <Box flexDirection="row" gap={1} alignItems="center">
        <Box width={2} flexShrink={0}>
          <Text {...toned(mark.tone)}>{mark.glyph}</Text>
        </Box>
        <Box flexGrow={1} flexShrink={1} minWidth={0}>
          <Text wrap="truncate-end" strikethrough={gone} dimColor={gone}>{r.fact.sentence}</Text>
        </Box>
        {!gone && inline && trustColumns(els, r, ctx)}
        {gone && <Button key={`az-restore-${id}`} label="Restore" plain={true} dimColor={true} onPress={() => act.restore(r.fact)} />}
      </Box>
      {!gone && !inline && (
        <Box paddingLeft={3}>{trustColumns(els, r, ctx)}</Box>
      )}
      {!gone && (
        <Box flexDirection="row" paddingLeft={3} gap={2} {...hidden}>
          <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
            {detail.map(line => <Text dimColor={true} wrap="wrap">{line}</Text>)}
          </Box>
          {r.actionable && <Button key={`az-forget-${id}`} label="Forget" plain={true} dimColor={true} onPress={() => act.forget(r.fact)} />}
        </Box>
      )}
      {(r.state === 'failed' || gone) && r.message !== null && <Box paddingLeft={3}><Text color="error">{r.message}</Text></Box>}
      {r.citedBy.length > 0 && <Box paddingLeft={3}><Text color="warning">{cited(r.citedBy)}</Text></Box>}
    </Box>
  )
}

export function memoryFigures(v: MemoryView, now: number): MemoryFigures {
  const kept = v.rows.filter(r => r.state !== 'forgotten').map(r => r.fact)
  const dated = kept.filter(f => f.createdAt !== null && !Number.isNaN(Date.parse(f.createdAt)))
  const times = dated.map(f => Date.parse(f.createdAt!))
  const iso = (t: number) => new Date(t).toISOString()
  return {
    loaded: kept.filter(f => f.inHotSet).length,
    active: v.active,
    yours: kept.filter(f => f.said !== null).length,
    waiting: v.waiting,
    loadedAt: v.loadedAt,
    dots: dated.map(f => ({ days: (now - Date.parse(f.createdAt!)) / DAY, loaded: f.inHotSet, title: f.sentence })),
    oldest: times.length > 0 ? age(now, iso(Math.min(...times))) : null,
    newest: times.length > 0 ? age(now, iso(Math.max(...times))) : null,
  }
}

function memoryInstruments(els: Els, v: MemoryView, ctx: ViewCtx) {
  const f = memoryFigures(v, ctx.now)
  if (drawsSvg(els, ctx)) {
    const Svg = els.Svg!
    const alt = `Loaded ${f.loaded} of ${f.active}, ${f.yours} in your words, ${f.waiting} waiting`
    return <Svg source={memoryCluster(f, ctx.columns)} alt={alt} isInteractive={true} width={columnsToPx(ctx.columns)} />
  }
  const { Text } = els
  return <Text dimColor={true}>{`LOADED ${textGauge(f.loaded, f.active)} ${f.loaded}/${f.active}   YOURS ${textGauge(f.yours, f.active)} ${f.yours}/${f.active}   WAITING ${f.waiting}`}</Text>
}

export function memoryPane(els: Els, v: MemoryView, act: MemoryActions, ctx: ViewCtx) {
  const { Box, Text } = els
  const hot = v.rows.filter(r => r.state !== 'forgotten' && r.fact.inHotSet)
  const other = v.rows.filter(r => r.state !== 'forgotten' && !r.fact.inHotSet)
  const gone = v.rows.filter(r => r.state === 'forgotten')
  const group = (title: string, rows: MemoryRow[], note: string | null = null) =>
    rows.length === 0 ? [] : [section(els, title, rows.length, note), ...rows.map(r => factRow(els, r, act, ctx))]
  return (
    <Box flexDirection="column" gap={1}>
      {memoryInstruments(els, v, ctx)}
      {group('LOADED NOW', hot, v.loadedAt !== null ? `loaded ${v.loadedAt}` : null)}
      {group('NOT LOADED', other)}
      {group('FORGOTTEN', gone)}
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

function reviewRow(els: Els, r: PaneRow, act: ReviewActions, ctx: ViewCtx) {
  const { Box, Text, Button } = els
  const rejected = r.state === 'rejected'
  const mark = reviewMark(r)
  const kind = KIND_LABEL[r.item.kind] ?? r.item.kind
  const meta = `${kind} · ${r.item.provenance} · ${age(ctx.now, r.item.createdAt)}`
  return (
    <Box key={`az-item-${r.item.id}`} flexDirection="column">
      <Box flexDirection="row" gap={1} alignItems="center">
        <Box width={2} flexShrink={0}>
          <Text {...toned(mark.tone)}>{mark.glyph}</Text>
        </Box>
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
      <Box paddingLeft={3} flexShrink={1} minWidth={0}>
        <Text dimColor={true} wrap="truncate-end">{meta}</Text>
      </Box>
      {r.state === 'failed' && <Box paddingLeft={3}><Text color="error">{r.message ?? ''}</Text></Box>}
    </Box>
  )
}

function reviewInstruments(els: Els, v: ReviewView, ctx: ViewCtx) {
  if (drawsSvg(els, ctx)) {
    const Svg = els.Svg!
    return <Svg source={reviewCluster({ waiting: v.open, done: v.done }, ctx.columns)} alt={`${v.open} waiting, ${v.done} done`} isInteractive={true} width={columnsToPx(ctx.columns)} />
  }
  const { Text } = els
  return <Text dimColor={true}>{`WAITING ${v.open}   DONE ${v.done}`}</Text>
}

export function reviewPane(els: Els, v: ReviewView, act: ReviewActions, ctx: ViewCtx) {
  const { Box, Text } = els
  const waiting = v.rows.filter(r => r.actionable)
  const done = v.rows.filter(r => !r.actionable)
  return (
    <Box flexDirection="column" gap={1}>
      {reviewInstruments(els, v, ctx)}
      {waiting.length > 0 && section(els, 'WAITING FOR YOU', waiting.length)}
      {waiting.map(r => reviewRow(els, r, act, ctx))}
      {done.length > 0 && section(els, 'DONE', done.length)}
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
