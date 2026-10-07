import { atom, read, update } from 'claude-code'
import type { On } from 'claude-code'
import type { Fact, HudState, MemoryResults, PaneNote, PaneResults, PendingItem, RawOpen } from '../types'
import { bandModel } from './band'
import { cardForCall, groupCard, type CallLike } from './cards'
import { MEMORY_PANE, MEMORY_TITLE, cancelForget, forgetArgv, forgetResult, memoryRows, mergeMemory, type MemoryRow } from './memory'
import { KIND_LABEL, REVIEW_PANE, REVIEW_TITLE, mergeResult, paneResult, paneRows, reviewArgv } from './pane'
import { locateWorkspace, sessionData, writeMarks } from './session'
import { EMPTY_HUD, refreshJob, type HudIo } from './snapshot'
import { MUTED, PALETTE, bandSvg, cardSvg, factSvg, memoryHeaderSvg, paneHeaderSvg, pendingItemSvg } from './svg'

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
      await $.ui.open({ id, title })
      const io: HudIo = {
        run: (argv, init) => $.process.run(argv, init),
        read: p => $.fs.read(p) as Promise<string>,
        write: fn => update($, hudAtom, fn),
        status: t => $.ui.status(t),
        pluginRoot: $.plugin.root,
      }
      await data.gate.run(refreshJob(io, workspace))
    }
    const { Box, Text, Button, Svg } = $.ui.resolve(e) as Record<string, (props: Record<string, unknown>) => never>
    const review = m.showReview ? <Button key="az-review" label="Review" variant="primary" onPress={() => openPane(REVIEW_PANE, REVIEW_TITLE)} /> : null
    const memory = m.showMemory ? <Button key="az-memory" label="Memory" onPress={() => openPane(MEMORY_PANE, MEMORY_TITLE)} /> : null

    if (e.surface === 'terminal') {
      return (
        <Box flexDirection="row" gap={1}>
          {m.pills.map(p => (
            <Text color={PALETTE[p.tone].fg} backgroundColor={PALETTE[p.tone].bg}>{` ${p.text} `}</Text>
          ))}
          {m.ring !== null && (
            <Text color={MUTED}>{`context ${m.ring.percent}%${m.ring.note !== null ? ` · ${m.ring.note}` : ''}`}</Text>
          )}
          {review}
          {memory}
        </Box>
      )
    }
    return (
      <Box flexDirection="row" alignItems="center" gap={1}>
        <Svg source={bandSvg(m)} alt={m.alt} />
        {review}
        {memory}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: REVIEW_PANE }, async ($, e) => {
    const { Box, Text, Button, Svg } = $.ui.resolve(e) as Record<string, (props: Record<string, unknown>) => never>
    const data = sessionData(await $.session.id())
    const workspace = await locateWorkspace(data, () => $.session.root(), p => $.fs.stat(p).then(() => true, () => false))
    if (workspace === null) return <Text color={MUTED}>This is not an AgentZero workspace.</Text>

    const hud = await read($, hudAtom)
    if (hud.snapshot === null) {
      // never "nothing waits" when the state could not be read
      return <Text color={MUTED}>{hud.error !== null ? `memory unreadable (${hud.error})` : 'reading memory…'}</Text>
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
    const buttons = (item: PendingItem) => (
      <Box flexDirection="row" gap={2}>
        <Button key={`az-keep-${item.id}`} label="✓ Keep" plain={true} onPress={() => decide(item, 'keep')} />
        <Button key={`az-reject-${item.id}`} label="✗ Reject" plain={true} dimColor={true} onPress={() => decide(item, 'reject')} />
      </Box>
    )
    const empty = rows.length === 0 ? <Text color={PALETTE.green.fg}>Nothing is waiting for you ✓</Text> : null

    if (e.surface === 'terminal') {
      return (
        <Box flexDirection="column" gap={1}>
          <Text bold={true}>{`Waiting for you · ${open} waiting · ${done} done`}</Text>
          {rows.map(row => (
            <Box flexDirection="column">
              <Text>{`[${KIND_LABEL[row.item.kind] ?? row.item.kind}] ${row.item.sentence}`}</Text>
              {row.state === 'kept' && <Text color={PALETTE.green.fg}>✓ Kept</Text>}
              {row.state === 'rejected' && <Text color={MUTED}>✗ Rejected</Text>}
              {row.state === 'failed' && <Text color={PALETTE.red.fg}>{row.message ?? ''}</Text>}
              {row.actionable && buttons(row.item)}
            </Box>
          ))}
          {empty}
        </Box>
      )
    }
    return (
      <Box flexDirection="column" gap={1} paddingX={1}>
        <Svg source={paneHeaderSvg(open, done)} alt={`${open} waiting, ${done} done`} />
        {rows.map(row => (
          <Box flexDirection="column" gap={0}>
            <Svg source={pendingItemSvg(row)} alt={row.item.sentence} />
            {row.actionable && buttons(row.item)}
          </Box>
        ))}
        {empty}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: MEMORY_PANE }, async ($, e) => {
    const { Box, Text, Button, Svg } = $.ui.resolve(e) as Record<string, (props: Record<string, unknown>) => never>
    const data = sessionData(await $.session.id())
    const workspace = await locateWorkspace(data, () => $.session.root(), p => $.fs.stat(p).then(() => true, () => false))
    if (workspace === null) return <Text color={MUTED}>This is not an AgentZero workspace.</Text>

    const hud = await read($, hudAtom)
    // never "no Facts" when the list could not be read
    if (hud.snapshot === null) {
      return <Text color={MUTED}>{hud.error !== null ? `memory unreadable (${hud.error})` : 'reading memory…'}</Text>
    }
    if (hud.snapshot.facts === null) return <Text color={MUTED}>memory unreadable (fact list)</Text>
    const { rows, active, inHotSet, forgotten, hidden } = memoryRows(hud.snapshot.facts, await read($, memoryResultsAtom))
    if (rows.length === 0) return <Text color={MUTED}>No Facts yet.</Text>

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
      const io: HudIo = {
        run: (argv, init) => $.process.run(argv, init),
        read: p => $.fs.read(p) as Promise<string>,
        write: fn => update($, hudAtom, fn),
        status: t => $.ui.status(t),
        pluginRoot: $.plugin.root,
      }
      await data.gate.run(refreshJob(io, workspace))
    }
    const buttons = (row: MemoryRow) => {
      const id = row.fact.id
      if (row.state === 'confirming') {
        return (
          <Box flexDirection="row" gap={2}>
            <Text color={PALETTE.red.fg}>Forget this Fact?</Text>
            <Button key={`az-forget-yes-${id}`} label="✗ Forget" plain={true} onPress={() => forget(row.fact)} />
            <Button key={`az-forget-no-${id}`} label="Cancel" plain={true} dimColor={true} onPress={() => cancel(row.fact)} />
          </Box>
        )
      }
      return row.actionable ? <Button key={`az-forget-${id}`} label="Forget" plain={true} dimColor={true} onPress={() => ask(row.fact)} /> : null
    }
    const more = hidden > 0 ? <Text color={MUTED}>{`+${hidden} older Facts not shown`}</Text> : null

    if (e.surface === 'terminal') {
      const head = `Your memory · ${active} active · ${inHotSet} in hot set${forgotten > 0 ? ` · ${forgotten} forgotten` : ''}`
      return (
        <Box flexDirection="column" gap={1}>
          <Text bold={true}>{head}</Text>
          {rows.map(row => {
            const f = row.fact
            const parts = [
              f.createdAt !== null ? f.createdAt.slice(5, 16).replace('T', ' ') : null,
              f.inHotSet && row.state !== 'forgotten' ? '[in hot set]' : null,
              f.scope === 'task' ? '[task]' : null,
              f.sentence,
            ].filter((p): p is string => p !== null)
            return (
              <Box flexDirection="column">
                <Text dimColor={row.state === 'forgotten'}>{parts.join(' ')}</Text>
                <Text color={MUTED}>{f.said !== null ? `  Your words: “${f.said}”` : '  Inferred by the assistant, kept by you'}</Text>
                {row.state === 'forgotten' && <Text color={MUTED}>✗ Forgotten</Text>}
                {row.state === 'failed' && <Text color={PALETTE.red.fg}>{row.message ?? ''}</Text>}
                {row.citedBy.length > 0 && (
                  <Text color={PALETTE.amber.fg}>
                    {row.citedBy.length === 1
                      ? `Cited by skill ${row.citedBy[0]}, which needs a new version`
                      : `Cited by skills ${row.citedBy.join(', ')}, which need new versions`}
                  </Text>
                )}
                {buttons(row)}
              </Box>
            )
          })}
          {more}
        </Box>
      )
    }
    return (
      <Box flexDirection="column" gap={1} paddingX={1}>
        <Svg source={memoryHeaderSvg(active, inHotSet, forgotten)} alt={`${active} active, ${inHotSet} in hot set`} />
        {rows.map(row => (
          <Box flexDirection="column" gap={0}>
            <Svg source={factSvg(row)} alt={row.fact.sentence} />
            {buttons(row)}
          </Box>
        ))}
        {more}
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
    const { Box, Text, Button, Code, Svg } = $.ui.resolve(e) as Record<string, (props: Record<string, unknown>) => never>
    const toggle = (
      <Button key={`az-raw-${id}`} label={open ? 'Hide' : 'Raw command'} plain={true} dimColor={true}
        onPress={() => update($, rawOpenAtom, m => ({ ...m, [id]: !open }))} />
    )
    const raw = open ? <Code language="bash" source={rawText(call)} /> : null
    if (e.surface === 'terminal') {
      return (
        <Box flexDirection="column">
          <Text bold={true} color={PALETTE[card.tone].fg}>{`${card.icon} ${card.label} · ${card.title}`}</Text>
          {card.detail !== null && <Text color={MUTED}>{card.detail}</Text>}
          {toggle}
          {raw}
        </Box>
      )
    }
    return (
      <Box flexDirection="column">
        <Svg source={cardSvg(card)} alt={`${card.label}: ${card.title}`} />
        {toggle}
        {raw}
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
    const { Box, Text, Svg } = $.ui.resolve(e) as Record<string, (props: Record<string, unknown>) => never>
    const others = e.props.calls.length - cards.length
    return (
      <Box flexDirection="column" gap={1}>
        {cards.map(card => (
          <Svg source={cardSvg(card)} alt={`${card.label}: ${card.title}`} />
        ))}
        {others > 0 && <Text color={MUTED}>{others === 1 ? '+1 other command' : `+${others} other commands`}</Text>}
      </Box>
    )
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === REVIEW_PANE) await update($, paneResultsAtom, () => ({}))
    if (e.id === MEMORY_PANE) await update($, memoryResultsAtom, () => ({}))
    return next(e)
  })
}
