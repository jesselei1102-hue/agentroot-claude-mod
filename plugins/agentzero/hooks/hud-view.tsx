import type { Fact, PendingItem } from '../types'
import type { BandModel, PillTone } from './band'
import type { MemoryRow } from './memory'
import { bandSvg, designWidth, factCard, groupHeader, itemCard, memoryHeader, reviewHeader, textGauge, type Dot } from './instruments'
import { KIND_LABEL, type PaneRow } from './pane'
import { DAY, age, displayWidth, factDetail, metaLine, themeOf } from './view'

// The HUD's trees, from plain data: no `$` here, so a preview mod can draw them with fixtures.
// On desktop the panes and the band are drawn whole, as the mods people pick for their looks do:
// a header and a card per row, each an SVG (instruments.ts), with native buttons laid over the
// cards. Where no SVG is drawn (terminal, phone) the same content is the app's own text.

export type El = (props: Record<string, unknown>) => never
export type Els = { Box: El; Text: El; Button: El; Svg?: El }
export type ViewCtx = { surface: 'terminal' | 'desktop' | 'vscode' | 'mobile'; columns: number; now: number }

// Hover needs a pointer: desktop and VS Code have one; the terminal and the phone show details plainly.
const hovers = (ctx: ViewCtx) => ctx.surface === 'desktop' || ctx.surface === 'vscode'
const drawsSvg = (els: Els, ctx: ViewCtx) => els.Svg !== undefined && (ctx.surface === 'desktop' || ctx.surface === 'vscode')

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

const citedLine = (skills: string[]) =>
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
        {r.citedBy.length > 0 && <Text color="warning">{citedLine(r.citedBy)}</Text>}
      </Box>
    </Box>
  )
}

export type MemoryFigures = { loaded: number; active: number; waiting: number; dots: Dot[]; newest: string | null }

export function memoryFigures(v: MemoryView, now: number): MemoryFigures {
  const dated = v.facts.filter(f => f.createdAt !== null && !Number.isNaN(Date.parse(f.createdAt)))
  const newest = dated.length > 0 ? Math.max(...dated.map(f => Date.parse(f.createdAt!))) : null
  return {
    loaded: v.facts.filter(f => f.inHotSet).length,
    active: v.active,
    waiting: v.waiting,
    dots: dated.map(f => ({ days: (now - Date.parse(f.createdAt!)) / DAY, loaded: f.inHotSet, title: f.sentence })),
    newest: newest !== null ? age(now, new Date(newest).toISOString()) : null,
  }
}

function memoryGauges(els: Els, v: MemoryView, ctx: ViewCtx) {
  const f = memoryFigures(v, ctx.now)
  return <els.Text dimColor={true}>{`IN USE ${textGauge(f.loaded, f.active)} ${f.loaded}/${f.active}   TO REVIEW ${f.waiting}`}</els.Text>
}

// ---- desktop: drawn whole ----

const cited = (skills: string[]) =>
  skills.length === 0 ? null
    : skills.length === 1 ? `Cited by skill ${skills[0]}, which needs a new version`
    : `Cited by skills ${skills.join(', ')}, which need new versions`

function cardData(r: MemoryRow, now: number) {
  const f = r.fact
  const a = age(now, f.createdAt)
  return {
    sentence: f.sentence,
    loaded: f.inHotSet,
    state: r.state === 'forgotten' ? 'forgotten' as const : r.state === 'failed' ? 'failed' as const : 'active' as const,
    yours: f.said !== null,
    age: a === '—' ? null : a,
    task: f.scope === 'task',
    updated: f.replaces !== null,
    quote: f.said,
    replaces: f.replaces,
    message: r.message,
    cited: cited(r.citedBy),
  }
}

// A card's actions: plain Buttons (a bordered one takes the keyboard and loses the next click),
// each in a round outline, side by side, centred on the card's height at its right. The desktop
// draws a button's label in its own colour, so the outline carries the meaning: red for Forget,
// blue for Restore, green for Keep, dim for Reject.
type Pill = { key: string; label: string; outline: 'error' | 'suggestion' | 'success' | 'dim'; onPress: () => unknown }

function actionPills(els: Els, pills: Pill[]) {
  const { Box, Button } = els
  return (
    <Box position="absolute" top={0} bottom={0} right={1} flexDirection="row" alignItems="center" gap={1}>
      {pills.map(p => (
        <Box key={`${p.key}-pill`} borderStyle="round" {...(p.outline === 'dim' ? { borderDimColor: true } : { borderColor: p.outline })} paddingX={1}>
          <Button key={p.key} label={p.label} plain={true} onPress={p.onPress} />
        </Box>
      ))}
    </Box>
  )
}

// A row: its card, and laid over it on hover the tinted card with the operator's words and Forget.
// A forgotten row shows Restore, and a failed one Forget, without hover.
function drawnFactRow(els: Els, r: MemoryRow, act: MemoryActions, ctx: ViewCtx) {
  const { Box } = els
  const Svg = els.Svg!
  const w = designWidth(ctx.columns)
  const data = cardData(r, ctx.now)
  const id = r.fact.id
  const button = (key: string, label: string, outline: Pill['outline'], onPress: () => unknown) => actionPills(els, [{ key, label, outline, onPress }])
  const plain = factCard(data, w, false)
  return (
    <Box key={`az-row-${id}`} flexDirection="column">
      <Svg source={plain.svg} alt={`${r.fact.sentence}. ${data.yours ? 'Your words' : "Claude's wording"}`} />
      {r.state === 'active' && (
        <Box position="absolute" top={0} left={0} right={0} display="none" hover={{ display: 'flex' }} flexDirection="column">
          <Svg source={factCard(data, w, true).svg} alt={data.quote !== null ? `Your words: ${data.quote}` : "Claude's wording, kept by you"} />
          {r.actionable && button(`az-forget-${id}`, 'Forget', 'error', () => act.forget(r.fact))}
        </Box>
      )}
      {r.state === 'forgotten' && button(`az-restore-${id}`, '↺ Restore', 'suggestion', () => act.restore(r.fact))}
      {r.state === 'failed' && r.actionable && button(`az-forget-${id}`, 'Forget', 'error', () => act.forget(r.fact))}
    </Box>
  )
}

function drawnMemoryPane(els: Els, v: MemoryView, act: MemoryActions, ctx: ViewCtx) {
  const { Box, Text } = els
  const Svg = els.Svg!
  const w = designWidth(ctx.columns)
  const f = memoryFigures(v, ctx.now)
  const head = memoryHeader({ ...f, hotSet: v.hotSet }, w)
  const group = (label: string, rows: MemoryRow[]) =>
    rows.length === 0 ? [] : [
      <Svg key={`az-group-${label}`} source={groupHeader(label, rows.length, w).svg} alt={`${label}: ${rows.length}`} />,
      ...rows.map(r => drawnFactRow(els, r, act, ctx)),
    ]
  return (
    <Box flexDirection="column">
      <Svg source={head.svg} alt={`Using ${f.loaded} of ${f.active} memories, ${f.waiting} to review`} />
      {group('In use now', v.rows.filter(r => r.state !== 'forgotten' && r.fact.inHotSet))}
      {group('Saved, not in use', v.rows.filter(r => r.state !== 'forgotten' && !r.fact.inHotSet))}
      {group('Forgotten', v.rows.filter(r => r.state === 'forgotten'))}
      {v.hidden > 0 && <Text dimColor={true}>{`+${v.hidden} older Facts not shown`}</Text>}
    </Box>
  )
}

export function memoryPane(els: Els, v: MemoryView, act: MemoryActions, ctx: ViewCtx) {
  if (drawsSvg(els, ctx)) return drawnMemoryPane(els, v, act, ctx)
  const { Box, Text } = els
  const hot = v.rows.filter(r => r.state !== 'forgotten' && r.fact.inHotSet)
  const other = v.rows.filter(r => r.state !== 'forgotten' && !r.fact.inHotSet)
  const gone = v.rows.filter(r => r.state === 'forgotten')
  const group = (title: string, rows: MemoryRow[], note: Note | null = null) =>
    rows.length === 0 ? [] : [section(els, title, rows.length, note), ...rows.map(r => factRow(els, r, act, ctx))]
  return (
    <Box flexDirection="column" gap={1}>
      {memoryGauges(els, v, ctx)}
      {group('In use now', hot, v.hotSet)}
      {group('Saved, not in use', other)}
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

function drawnItemRow(els: Els, r: PaneRow, act: ReviewActions, ctx: ViewCtx) {
  const { Box } = els
  const Svg = els.Svg!
  const kind = KIND_LABEL[r.item.kind] ?? r.item.kind
  const old = age(ctx.now, r.item.createdAt)
  const meta = [kind, r.item.provenance, ...(old !== '—' ? [old] : [])].join(' · ')
  const state = r.state === 'open' ? 'open' as const : r.state
  return (
    <Box key={`az-item-${r.item.id}`} flexDirection="column">
      <Svg source={itemCard({ sentence: r.item.sentence, state, meta, message: r.message }, designWidth(ctx.columns)).svg} alt={`${r.item.sentence}. ${meta}`} />
      {r.actionable && actionPills(els, [
        { key: `az-keep-${r.item.id}`, label: '✓ Keep', outline: 'success', onPress: () => act.decide(r.item, 'keep') },
        { key: `az-reject-${r.item.id}`, label: 'Reject', outline: 'dim', onPress: () => act.decide(r.item, 'reject') },
      ])}
    </Box>
  )
}

function drawnReviewPane(els: Els, v: ReviewView, act: ReviewActions, ctx: ViewCtx) {
  const { Box, Text } = els
  const Svg = els.Svg!
  const w = designWidth(ctx.columns)
  const waiting = v.rows.filter(r => r.actionable)
  const done = v.rows.filter(r => !r.actionable)
  return (
    <Box flexDirection="column">
      <Svg source={reviewHeader({ waiting: v.open, done: v.done }, w).svg} alt={`${v.open} to review, ${v.done} done`} />
      {waiting.length > 0 && <Svg source={groupHeader('To review', waiting.length, w).svg} alt={`To review: ${waiting.length}`} />}
      {waiting.map(r => drawnItemRow(els, r, act, ctx))}
      {done.length > 0 && <Svg source={groupHeader('Done', done.length, w).svg} alt={`Done: ${done.length}`} />}
      {done.map(r => drawnItemRow(els, r, act, ctx))}
      {v.rows.length === 0 && <Text color="success">Nothing is waiting for you ✓</Text>}
    </Box>
  )
}

export function reviewPane(els: Els, v: ReviewView, act: ReviewActions, ctx: ViewCtx) {
  if (drawsSvg(els, ctx)) return drawnReviewPane(els, v, act, ctx)
  const { Box, Text } = els
  const waiting = v.rows.filter(r => r.actionable)
  const done = v.rows.filter(r => !r.actionable)
  return (
    <Box flexDirection="column" gap={1}>
      <Text dimColor={true}>{`TO REVIEW ${v.open}   DONE ${v.done}`}</Text>
      {waiting.length > 0 && section(els, 'To review', waiting.length)}
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

export function band(els: Els, m: BandModel, act: BandActions, ctx: ViewCtx) {
  const { Box, Text, Button } = els
  if (m.drawn !== null && drawsSvg(els, ctx)) {
    const Svg = els.Svg!
    // the buttons take about 22 columns at the right
    const d = bandSvg(m.drawn, Math.max(240, (ctx.columns - 22) * 8.8))
    return (
      <Box flexDirection="row" alignItems="center" gap={2}>
        <Svg source={d.svg} alt={m.alt} width={d.width} height={d.height} />
        <Box flexGrow={1} />
        {m.showReview && <Button key="az-review" label="Review" variant="primary" onPress={act.review} />}
        {m.showMemory && <Button key="az-memory" label="Memory" onPress={act.memory} />}
      </Box>
    )
  }
  const ring = m.ring
  return (
    <Box flexDirection="row" alignItems="center" gap={2}>
      <Box flexDirection="row" gap={1} flexShrink={0}>
        <Text color="claude">◆</Text>
        <Text bold={true}>AgentRoot</Text>
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
