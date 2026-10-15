import { expect, test } from 'claude-code/testing'
import { PROMPT, SNAPSHOT, START, world } from './test-world'

const BAND = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} }
const PANE = { title: 'AgentZero · Review', isFocused: false, bodyColumns: 60, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 30 }, view: {} }
const EMPTY = JSON.stringify({ ...SNAPSHOT, pending: [] })
const F = (id: string, inHotSet: boolean, said: string | null) =>
  ({ id, sentence: id, said, author: 'human', createdAt: '2026-10-06T10:17:00.000+08:00', scope: 'project', inHotSet })
const FACTS = [F('fact:x', true, 'x'), F('fact:y', false, 'y'), F('fact:z', false, null)]

async function bandText(ui: { findAll: (q: { type: string }) => Promise<{ text?: string }[]> }) {
  return (await ui.findAll({ type: 'Text' })).map(t => String(t.text ?? '')).join('')
}

for (const surface of ['desktop', 'terminal'] as const) {
  test(`the band shows the snapshot on ${surface}`, async ($, on) => {
    world(on)
    await $.session.start(START)
    const ui = await $.ui.mount({ plugin: 'agentzero', surface, component: 'AbovePrompt', props: BAND })
    expect(await bandText(ui)).toBe('◆AgentZero3 active◉ 1 waiting▰▰▰▱▱▱▱▱context 41%')
    expect((await ui.find({ type: 'Text', text: '◉ 1 waiting' }))?.props.color).toBe('warning')
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  })
}

for (const surface of ['desktop', 'terminal'] as const) {
  test(`the band shows loaded and yours from the Facts on ${surface}`, async ($, on) => {
    const w = world(on)
    w.snapshotJson = JSON.stringify({ ...SNAPSHOT, facts: FACTS })
    await $.session.start(START)
    const ui = await $.ui.mount({ plugin: 'agentzero', surface, component: 'AbovePrompt', props: BAND })
    expect(await bandText(ui)).toBe('◆AgentZero● 1/3 loaded❝ 2/3 yours◉ 1 waiting▰▰▰▱▱▱▱▱context 41%')
    expect((await ui.find({ type: 'Text', text: '● 1/3 loaded' }))?.props.color).toBe('suggestion')
  })
}

test('the review button opens the pane and refreshes', async ($, on) => {
  const w = world(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'agentzero', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  const before = w.snapshotRuns.length
  await ui.press({ key: 'az-review' })
  expect(w.opened).toEqual(['agentzero-review'])
  expect(w.snapshotRuns.length).toBe(before + 1)
})

test('the band has a Memory button that opens the pane', async ($, on) => {
  const w = world(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'agentzero', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  const before = w.snapshotRuns.length
  await ui.press({ key: 'az-memory' })
  expect(w.opened).toEqual(['agentzero-memory'])
  expect(w.snapshotRuns.length).toBe(before + 1)
})

test('no band outside a workspace or during a survey', async ($, on) => {
  const w = world(on, { existing: [] })
  await $.session.start(START)
  await $.ui.mount({ plugin: 'agentzero', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  expect(w.engineDrew).toEqual(['AbovePrompt'])
  w.existing.add('/w/System.md')
  await $.ui.mount({ plugin: 'agentzero', surface: 'desktop', component: 'AbovePrompt', props: { ...BAND, hasSurvey: true } })
  expect(w.engineDrew).toEqual(['AbovePrompt', 'AbovePrompt'])
})

test('no ring when usage has no percent', async ($, on) => {
  const w = world(on)
  w.contextPercent = undefined
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'agentzero', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  expect(await bandText(ui)).not.toContain('context')
})

test('a failed hot set shows red in the band', async ($, on) => {
  const w = world(on)
  await $.session.start(START)
  w.setRun({ exitCode: 1, stdout: '' })
  await $.prompt.submit(PROMPT('one'))
  const ui = await $.ui.mount({ plugin: 'agentzero', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  expect((await ui.find({ type: 'Text', text: 'hot set not loaded (exit 1)' }))?.props.color).toBe('error')
})

test('/agentzero review opens the pane', async ($, on) => {
  const w = world(on)
  await $.session.start(START)
  const out = await $.command.run({ command: 'agentzero', args: 'review' })
  expect(out.text).toBe('Opened the AgentZero review pane.')
  expect(w.opened).toEqual(['agentzero-review'])
})

test('/agentzero review outside a workspace opens nothing', async ($, on) => {
  const w = world(on, { existing: [] })
  const out = await $.command.run({ command: 'agentzero', args: 'review' })
  expect(out.text).toContain('not inside an AgentZero workspace')
  expect(w.opened).toEqual([])
})

async function mountPane($: any) {
  return $.ui.mount({ plugin: 'agentzero', surface: 'desktop', component: 'Pane', props: PANE, requestId: 'agentzero-review' })
}

test('the pane lists what waits, with keep and reject', async ($, on) => {
  world(on)
  await $.session.start(START)
  const ui = await mountPane($)
  expect(String((await ui.find({ type: 'Svg' }))?.props.source)).toContain('WAITING')
  expect(await bandText(ui)).toContain('WAITING FOR YOU · 1')
  expect((await ui.findAll({ type: 'Box' })).some((b: any) => b.props.display === 'none')).toBe(false)
  expect(await ui.find({ text: '周五不部署' })).toBeDefined()
  expect(await bandText(ui)).toContain('Fact · agent proposed it · ')
  expect(await ui.find({ key: 'az-keep-fact:a' })).toBeDefined()
  expect(await ui.find({ key: 'az-reject-fact:a' })).toBeDefined()
})

test('keep runs the kernel and marks the item kept', async ($, on) => {
  const w = world(on)
  w.responder = () => ({ exitCode: 0, stdout: 'confirmed: fact:a — 周五不部署\n' })
  await $.session.start(START)
  const ui = await mountPane($)
  w.snapshotJson = EMPTY
  await ui.press({ key: 'az-keep-fact:a' })
  expect(w.runs.at(-1)).toEqual({ argv: ['/w/a0', 'memory', 'review', '--confirm', 'fact:a'], init: { cwd: '/w', timeoutMs: 10000 } })
  expect(await bandText(ui)).toContain('DONE · 1')
  expect((await ui.find({ type: 'Text', text: '✓' }))?.props.color).toBe('success')
  expect(await ui.find({ key: 'az-keep-fact:a' })).toBeUndefined()
})

test("a keep that fails shows the kernel's first error line and keeps the buttons", async ($, on) => {
  const w = world(on)
  w.responder = () => ({ exitCode: 1, stderr: 'No pending item fact:a\nmore' })
  await $.session.start(START)
  const ui = await mountPane($)
  await ui.press({ key: 'az-keep-fact:a' })
  expect((await ui.find({ type: 'Text', text: 'No pending item fact:a' }))?.props.color).toBe('error')
  expect(await ui.find({ key: 'az-keep-fact:a' })).toBeDefined()
})

test('a keep on an item handled elsewhere shows the error, not all clear', async ($, on) => {
  const w = world(on)
  w.responder = () => ({ exitCode: 1, stderr: 'no item waiting for confirmation with id fact:a' })
  await $.session.start(START)
  const ui = await mountPane($)
  w.snapshotJson = EMPTY
  await ui.press({ key: 'az-keep-fact:a' })
  expect(await ui.find({ text: 'no item waiting for confirmation with id fact:a' })).toBeDefined()
  expect(await ui.find({ text: 'Nothing is waiting for you ✓' })).toBeUndefined()
  expect(await ui.find({ key: 'az-keep-fact:a' })).toBeUndefined()
})

test('with no snapshot the pane says why, not all clear', async ($, on) => {
  const w = world(on)
  w.snapshotJson = 'not json'
  await $.session.start(START)
  const ui = await mountPane($)
  expect(await ui.find({ text: 'memory unreadable (unreadable snapshot)' })).toBeDefined()
  expect(await ui.find({ text: 'Nothing is waiting for you ✓' })).toBeUndefined()
})

// A long line must never push the buttons out of the pane (lab, 2026-10-08): the line beside them shrinks.
test('the line beside the Review buttons shrinks', async ($, on) => {
  world(on)
  await $.session.start(START)
  const ui = await mountPane($)
  const shrinking = (await ui.findAll({ type: 'Box' })).filter((b: any) => b.props.flexShrink === 1 && b.props.minWidth === 0)
  expect(shrinking.length > 0).toBe(true)
})

test('the Review pane on terminal draws no SVG', async ($, on) => {
  world(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: 'agentzero', surface: 'terminal', component: 'Pane', props: PANE, requestId: 'agentzero-review' })
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  expect(await bandText(ui)).toContain('WAITING 1')
})
