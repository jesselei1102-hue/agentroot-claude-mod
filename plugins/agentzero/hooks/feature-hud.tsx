import { atom, read, update } from 'claude-code'
import type { On } from 'claude-code'
import type { Fact, HudState, MemoryResults, PaneNote, PaneResults, PendingItem, RawOpen } from '../types'
import { bandModel } from './band'
import { cardForCall, groupCard, type CallLike, type Card } from './cards'
import { band, memoryPane, reviewPane, toned, type El, type Els, type ViewCtx } from './hud-view'
import { hotSetNote } from './view'
import { MEMORY_PANE, MEMORY_TITLE, cancelForget, forgetArgv, forgetResult, memoryRows, mergeMemory, restoreResult } from './memory'
import { REVIEW_PANE, REVIEW_TITLE, mergeResult, paneResult, paneRows, reviewArgv } from './pane'
import { locateWorkspace, sessionData, writeMarks } from './session'
import { EMPTY_HUD, refreshJob, runTool, type HudIo } from './snapshot'

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
    const els = $.ui.resolve(e) as unknown as Els
    const ctx: ViewCtx = { surface: e.surface, columns: e.props.bodyColumns, now: await $.clock.now() }
    return band(els, m, { review: () => openPane(REVIEW_PANE, REVIEW_TITLE), memory: () => openPane(MEMORY_PANE, MEMORY_TITLE) }, ctx)
  })

  on('ui.render', { component: 'Pane', requestId: REVIEW_PANE }, async ($, e) => {
    const { Text } = $.ui.resolve(e) as Record<string, El>
    const data = sessionData(await $.session.id())
    const workspace = await locateWorkspace(data, () => $.session.root(), p => $.fs.stat(p).then(() => true, () => false))
    if (workspace === null) return <Text dimColor={true}>This is not an AgentRoot workspace.</Text>

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
    // Plain buttons: a bordered one takes the keyboard, and the redraw after a press then loses the next click.
    const ctx: ViewCtx = { surface: e.surface, columns: e.props.bodyColumns, now: await $.clock.now() }
    return reviewPane($.ui.resolve(e) as unknown as Els, { rows, open, done }, { decide }, ctx)
  })

  on('ui.render', { component: 'Pane', requestId: MEMORY_PANE }, async ($, e) => {
    const { Text } = $.ui.resolve(e) as Record<string, El>
    const data = sessionData(await $.session.id())
    const workspace = await locateWorkspace(data, () => $.session.root(), p => $.fs.stat(p).then(() => true, () => false))
    if (workspace === null) return <Text dimColor={true}>This is not an AgentRoot workspace.</Text>

    const hud = await read($, hudAtom)
    // never "no Facts" when the list could not be read
    if (hud.snapshot === null) {
      return <Text dimColor={true}>{hud.error !== null ? `memory unreadable (${hud.error})` : 'reading memory…'}</Text>
    }
    if (hud.snapshot.facts === null) return <Text dimColor={true}>memory unreadable (fact list)</Text>
    const { rows, kept, active, hidden } = memoryRows(hud.snapshot.facts, await read($, memoryResultsAtom))
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
    const restore = async (fact: Fact) => {
      const io = { run: (argv: string[], init: Parameters<typeof $.process.run>[1]) => $.process.run(argv, init), read: (p: string) => $.fs.read(p) as Promise<string>, pluginRoot: $.plugin.root }
      const result = restoreResult(fact, await runTool(io, workspace, 'restore.py', [fact.id], KEEP_TIMEOUT_MS))
      if (result === null) {
        await update($, memoryResultsAtom, m => cancelForget(m, fact.id))
        // a forget the assistant has not heard of yet is simply withdrawn
        await update($, paneNotesAtom, notes => {
          const i = notes.findIndex(n => n.verb === 'forgot' && n.sentence === fact.sentence)
          return i >= 0 ? notes.filter((_, j) => j !== i) : [...notes, { verb: 'restored', kind: 'fact', sentence: fact.sentence }]
        })
      } else {
        await update($, memoryResultsAtom, m => ({ ...m, [fact.id]: result }))
      }
      await refresh()
    }
    const waiting = hud.snapshot.pending.length
    const now = await $.clock.now()
    const hotSet = hotSetNote(now, hud.snapshot.hotSet?.at ?? null, await read($, hotSetErrorAtom))
    const ctx: ViewCtx = { surface: e.surface, columns: e.props.bodyColumns, now }
    return memoryPane($.ui.resolve(e) as unknown as Els, { rows, facts: kept, active, waiting, hidden, hotSet }, { forget, restore }, ctx)
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
