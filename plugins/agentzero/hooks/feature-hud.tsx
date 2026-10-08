import { atom, read, update } from 'claude-code'
import type { On } from 'claude-code'
import type { Fact, HudState, MemoryResults, PaneNote, PaneResults, PendingItem, RawOpen } from '../types'
import { bandModel } from './band'
import { cardForCall, groupCard, type CallLike, type Card } from './cards'
import { MEMORY_PANE, MEMORY_TITLE, cancelForget, forgetArgv, forgetResult, memoryRows, mergeMemory, type MemoryRow } from './memory'
import { KIND_LABEL, REVIEW_PANE, REVIEW_TITLE, mergeResult, paneResult, paneRows, reviewArgv } from './pane'
import { locateWorkspace, sessionData, writeMarks } from './session'
import { EMPTY_HUD, refreshJob, type HudIo } from './snapshot'
import type { PillTone } from './band'
import { factMeta, reviewMeta, themeOf } from './view'

const hudAtom = atom({ plugin: 'agentzero', key: 'hud' } as const, EMPTY_HUD as HudState)
const hotSetErrorAtom = atom({ plugin: 'agentzero', key: 'hotSetError' } as const, null as string | null)
const paneResultsAtom = atom({ plugin: 'agentzero', key: 'paneResults' } as const, {} as PaneResults)
const rawOpenAtom = atom({ plugin: 'agentzero', key: 'rawOpen' } as const, {} as RawOpen)
const memoryResultsAtom = atom({ plugin: 'agentzero', key: 'memoryResults' } as const, {} as MemoryResults)
// What the operator changed in a pane, for the assistant on the next prompt (feature-hotset.ts)
const paneNotesAtom = atom({ plugin: 'agentzero', key: 'paneNotes' } as const, [] as PaneNote[])

const KEEP_TIMEOUT_MS = 10_000

function field(value: unknown, key: string): string {
  const v = typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined
  return typeof v === 'string' ? v : ''
}

// What "原始命令" shows: the command and its output for Bash, the path for a Read.
function rawText(call: CallLike): string {
  if (call.tool === 'Read') return field(call.input, 'file_path')
  return `$ ${field(call.input, 'command')}\n${field(call.output, 'stdout')}`.trimEnd()
}

type El = (props: Record<string, unknown>) => never

// A tone as Text props: a theme key, dim for grey, nothing for ink.
function toned(tone: PillTone): Record<string, unknown> {
  const color = themeOf(tone)
  if (color !== undefined) return { color }
  return tone === 'grey' ? { dimColor: true } : {}
}

// A card as two lines: the label in its colour, the title; the detail dim under them.
function cardLines(Box: El, Text: El, card: Card) {
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={1}>
        <Text bold={true} {...toned(card.tone)}>{`${card.icon} ${card.label}`}</Text>
        <Text wrap="truncate-end">{card.title}</Text>
      </Box>
      {card.detail !== null && <Text dimColor={true} wrap="truncate-end">{card.detail}</Text>}
    </Box>
  )
}

export function registerHud(on: On): void {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const data = sessionData(await $.session.id())
    const workspace = await locateWorkspace(data, () => $.session.root(), p => $.fs.stat(p).then(() => true, () => false))
    if (workspace === null) return next(e)

    let percent: number | undefined
    try {
      percent = (await $.session.usage()).context.percent
    } catch {
      percent = undefined
    }
    const m = bandModel(await read($, hudAtom), await read($, hotSetErrorAtom), percent, await $.clock.now())
    const openPane = async (id: string, title: string) => {
      // with the keyboard: a first click that moves it into the pane redraws it and is lost
      await $.ui.open({ id, title, focus: true })
      const io: HudIo = {
        run: (argv, init) => $.process.run(argv, init),
        read: p => $.fs.read(p) as Promise<string>,
        write: fn => update($, hudAtom, fn),
        status: t => $.ui.status(t),
        pluginRoot: $.plugin.root,
      }
      await data.gate.run(refreshJob(io, workspace))
    }
    const { Box, Text, Button } = $.ui.resolve(e) as Record<string, El>
    const review = m.showReview ? <Button key="az-review" label="Review" variant="primary" onPress={() => openPane(REVIEW_PANE, REVIEW_TITLE)} /> : null
    const memory = m.showMemory ? <Button key="az-memory" label="Memory" onPress={() => openPane(MEMORY_PANE, MEMORY_TITLE)} /> : null
    const parts = [...m.pills]
    if (m.ring !== null) {
      const note = m.ring.note !== null ? ` · ${m.ring.note}` : ''
      parts.push({ text: `context ${m.ring.percent}%${note}`, tone: m.ring.tone === 'amber' ? 'amber' : 'grey' })
    }
    return (
      <Box flexDirection="row" alignItems="center" gap={1}>
        <Text bold={true}>AgentZero</Text>
        <Box flexDirection="row" flexGrow={1}>
          {parts.flatMap((p, i) => [
            i > 0 ? <Text dimColor={true}> · </Text> : null,
            <Text {...toned(p.tone)}>{p.text}</Text>,
          ])}
        </Box>
        {review}
        {memory}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: REVIEW_PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e) as Record<string, El>
    const data = sessionData(await $.session.id())
    const workspace = await locateWorkspace(data, () => $.session.root(), p => $.fs.stat(p).then(() => true, () => false))
    if (workspace === null) return <Text dimColor={true}>This is not an AgentZero workspace.</Text>

    const hud = await read($, hudAtom)
    if (hud.snapshot === null) {
      // never "nothing waits" when the state could not be read
      return <Text dimColor={true}>{hud.error !== null ? `memory unreadable (${hud.error})` : 'reading memory…'}</Text>
    }
    const { rows, open, done } = paneRows(hud.snapshot?.pending ?? [], await read($, paneResultsAtom))
    const decide = async (item: PendingItem, verb: 'keep' | 'reject') => {
      let ran
      try {
        ran = await $.process.run(reviewArgv(workspace, verb, item.id), { cwd: workspace, timeoutMs: KEEP_TIMEOUT_MS })
      } catch (err) {
        ran = err instanceof Error ? err : new Error(String(err))
      }
      const result = paneResult(item, verb, ran)
      await update($, paneResultsAtom, m => mergeResult(m, result))
      if (result.outcome !== 'failed') {
        const note: PaneNote = { verb: result.outcome, kind: item.kind, sentence: item.sentence }
        await update($, paneNotesAtom, notes => [...notes, note])
      }
      const io: HudIo = {
        run: (argv, init) => $.process.run(argv, init),
        read: p => $.fs.read(p) as Promise<string>,
        write: fn => update($, hudAtom, fn),
        status: t => $.ui.status(t),
        pluginRoot: $.plugin.root,
      }
      await data.gate.run(refreshJob(io, workspace))
    }
    // Plain: a bordered button takes the keyboard, and the redraw after a press then loses the next click.
    const buttons = (item: PendingItem) => (
      <Box flexDirection="row" gap={2}>
        <Button key={`az-keep-${item.id}`} label="✓ Keep" plain={true} onPress={() => decide(item, 'keep')} />
        <Button key={`az-reject-${item.id}`} label="✗ Reject" plain={true} dimColor={true} onPress={() => decide(item, 'reject')} />
      </Box>
    )
    return (
      <Box flexDirection="column" gap={1}>
        <Text dimColor={true}>{`${open} waiting · ${done} done`}</Text>
        {rows.map(row => {
          const rejected = row.state === 'rejected'
          return (
            <Box borderStyle="round" borderDimColor={true} paddingX={1} flexDirection="column">
              <Text strikethrough={rejected} dimColor={rejected}>{row.item.sentence}</Text>
              <Text dimColor={true}>{`${KIND_LABEL[row.item.kind] ?? row.item.kind} · ${reviewMeta(row.item)}`}</Text>
              {row.state === 'kept' && <Text color="success">✓ Kept</Text>}
              {rejected && <Text dimColor={true}>✗ Rejected</Text>}
              {row.state === 'failed' && <Text color="error">{row.message ?? ''}</Text>}
              {row.actionable && buttons(row.item)}
            </Box>
          )
        })}
        {rows.length === 0 && <Text color="success">Nothing is waiting for you ✓</Text>}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: MEMORY_PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e) as Record<string, El>
    const data = sessionData(await $.session.id())
    const workspace = await locateWorkspace(data, () => $.session.root(), p => $.fs.stat(p).then(() => true, () => false))
    if (workspace === null) return <Text dimColor={true}>This is not an AgentZero workspace.</Text>

    const hud = await read($, hudAtom)
    // never "no Facts" when the list could not be read
    if (hud.snapshot === null) {
      return <Text dimColor={true}>{hud.error !== null ? `memory unreadable (${hud.error})` : 'reading memory…'}</Text>
    }
    if (hud.snapshot.facts === null) return <Text dimColor={true}>memory unreadable (fact list)</Text>
    const { rows, active, inHotSet, forgotten, hidden } = memoryRows(hud.snapshot.facts, await read($, memoryResultsAtom))
    if (rows.length === 0) return <Text dimColor={true}>No Facts yet.</Text>

    const refresh = () => {
      const io: HudIo = {
        run: (argv, init) => $.process.run(argv, init),
        read: p => $.fs.read(p) as Promise<string>,
        write: fn => update($, hudAtom, fn),
        status: t => $.ui.status(t),
        pluginRoot: $.plugin.root,
      }
      return data.gate.run(refreshJob(io, workspace))
    }
    const ask = (fact: Fact) => update($, memoryResultsAtom, m => mergeMemory(m, { fact, outcome: 'confirming', message: '', citedBy: [] }))
    const cancel = (fact: Fact) => update($, memoryResultsAtom, m => cancelForget(m, fact.id))
    const forget = async (fact: Fact) => {
      let ran
      try {
        ran = await $.process.run(forgetArgv(workspace, fact.id), { cwd: workspace, timeoutMs: KEEP_TIMEOUT_MS })
      } catch (err) {
        ran = err instanceof Error ? err : new Error(String(err))
      }
      const result = forgetResult(fact, ran)
      await update($, memoryResultsAtom, m => mergeMemory(m, result))
      if (result.outcome === 'forgotten') {
        await update($, paneNotesAtom, notes => [...notes, { verb: 'forgot', kind: 'fact', sentence: fact.sentence }])
      }
      await refresh()
    }
    const head = `${active} active · ${inHotSet} in hot set${forgotten > 0 ? ` · ${forgotten} forgotten` : ''}`
    const cited = (skills: string[]) =>
      skills.length === 1
        ? `Cited by skill ${skills[0]}, which needs a new version`
        : `Cited by skills ${skills.join(', ')}, which need new versions`
    return (
      <Box flexDirection="column" gap={1}>
        <Text dimColor={true}>{head}</Text>
        {rows.map((row: MemoryRow) => {
          const id = row.fact.id
          const gone = row.state === 'forgotten'
          const meta = factMeta(row)
          return (
            <Box borderStyle="round" borderDimColor={true} paddingX={1} flexDirection="column">
              <Text strikethrough={gone} dimColor={gone}>{row.fact.sentence}</Text>
              <Text dimColor={true}>{meta.words}</Text>
              <Box flexDirection="row">
                {meta.tags.map(seg => (seg.color !== undefined ? <Text color={seg.color}>{seg.text}</Text> : <Text dimColor={true}>{seg.text}</Text>))}
              </Box>
              {gone && <Text dimColor={true}>forgotten</Text>}
              {row.state === 'failed' && <Text color="error">{row.message ?? ''}</Text>}
              {row.citedBy.length > 0 && <Text color="warning">{cited(row.citedBy)}</Text>}
              {row.state === 'confirming' ? (
                <Box flexDirection="row" gap={2} alignItems="center">
                  <Text color="error">Forget this Fact?</Text>
                  <Button key={`az-forget-yes-${id}`} label="✗ Forget" plain={true} onPress={() => forget(row.fact)} />
                  <Button key={`az-forget-no-${id}`} label="Cancel" plain={true} dimColor={true} onPress={() => cancel(row.fact)} />
                </Box>
              ) : (
                row.actionable && (
                  <Box flexDirection="row">
                    <Button key={`az-forget-${id}`} label="Forget" plain={true} dimColor={true} onPress={() => ask(row.fact)} />
                  </Box>
                )
              )}
            </Box>
          )
        })}
        {hidden > 0 && <Text dimColor={true}>{`+${hidden} older Facts not shown`}</Text>}
      </Box>
    )
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const data = sessionData(await $.session.id())
    const workspace = await locateWorkspace(data, () => $.session.root(), p => $.fs.stat(p).then(() => true, () => false))
    if (workspace === null) return next(e)
    const call: CallLike = e.props
    const card = cardForCall(call, workspace, writeMarks)
    if (card === null) return next(e)

    const id = e.props.tool_use_id
    const open = (await read($, rawOpenAtom))[id] === true
    const { Box, Button, Code, Text } = $.ui.resolve(e) as Record<string, El>
    return (
      <Box flexDirection="column">
        {cardLines(Box, Text, card)}
        <Button key={`az-raw-${id}`} label={open ? 'Hide' : 'Raw command'} plain={true} dimColor={true}
          onPress={() => update($, rawOpenAtom, m => ({ ...m, [id]: !open }))} />
        {open && <Code language="bash" source={rawText(call)} />}
      </Box>
    )
  })

  // A folded group hides the cards inside it. The terminal draws a group open when asked;
  // the desktop ignores that (probe, 2026-10-06) but shows a tree the plugin draws under its
  // own fold header, so there the group draws its cards itself.
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (e.props.isExpanded) return next(e)
    const data = sessionData(await $.session.id())
    const workspace = await locateWorkspace(data, () => $.session.root(), p => $.fs.stat(p).then(() => true, () => false))
    if (workspace === null) return next(e)
    if (e.surface === 'terminal') {
      const done = e.props.calls.some(call => cardForCall(call, workspace, writeMarks) !== null)
      return done ? next({ ...e, props: { ...e.props, isExpanded: true } }) : next(e)
    }
    const cards = e.props.calls.map(call => groupCard(call, workspace, writeMarks)).filter(card => card !== null)
    if (cards.length === 0) return next(e)
    const { Box, Text } = $.ui.resolve(e) as Record<string, El>
    const others = e.props.calls.length - cards.length
    return (
      <Box flexDirection="column" gap={1}>
        {cards.map(card => cardLines(Box, Text, card))}
        {others > 0 && <Text dimColor={true}>{others === 1 ? '+1 other command' : `+${others} other commands`}</Text>}
      </Box>
    )
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === REVIEW_PANE) await update($, paneResultsAtom, () => ({}))
    if (e.id === MEMORY_PANE) await update($, memoryResultsAtom, () => ({}))
    return next(e)
  })
}
