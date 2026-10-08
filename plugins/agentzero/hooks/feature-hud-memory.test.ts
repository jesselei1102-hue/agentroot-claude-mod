import { expect, test } from 'claude-code/testing'
import { SNAPSHOT, START, world } from './test-world'

const PANE = { title: 'AgentZero · Memory', isFocused: false, bodyColumns: 60, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 30 }, view: {} }
const A = { id: 'fact:a', sentence: 'Never deploy on Fridays.', said: '周五别部署', author: 'human', createdAt: '2026-10-06T10:17:00.000+08:00', scope: 'project', inHotSet: true }
const B = { id: 'fact:b', sentence: 'Deploys go out on Tuesdays.', said: null, author: 'agent', createdAt: '2026-10-03T14:30:00.000+08:00', scope: 'project', inHotSet: false }
const json = (facts: unknown) => JSON.stringify({ ...SNAPSHOT, facts })

async function mount($: any, surface: 'desktop' | 'terminal' = 'desktop') {
  return $.ui.mount({ plugin: 'agentzero', surface, component: 'Pane', props: PANE, requestId: 'agentzero-memory' })
}


test('/agentzero memory opens the pane', async ($, on) => {
  const w = world(on)
  await $.session.start(START)
  const before = w.snapshotRuns.length
  const out = await $.command.run({ command: 'agentzero', args: 'memory' })
  expect(out.text).toBe('Opened the AgentZero memory pane.')
  expect(w.opened).toEqual(['agentzero-memory'])
  expect(w.snapshotRuns.length).toBe(before + 1)
})

test('/agentzero memory outside a workspace opens nothing', async ($, on) => {
  const w = world(on, { existing: [] })
  const out = await $.command.run({ command: 'agentzero', args: 'memory' })
  expect(out.text).toContain('not inside an AgentZero workspace')
  expect(w.opened).toEqual([])
})

for (const surface of ['desktop', 'terminal'] as const) {
  test(`the pane lists the Facts on ${surface}`, async ($, on) => {
    const w = world(on)
    w.snapshotJson = json([A, B])
    await $.session.start(START)
    const ui = await mount($, surface)
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    expect(await ui.find({ text: '2 active · 1 in hot set' })).toBeDefined()
    expect(await ui.find({ text: 'Never deploy on Fridays.' })).toBeDefined()
    expect(await ui.find({ text: '“周五别部署”' })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^in hot set$/ }))?.props.color).toBe('suggestion')
    expect(await ui.find({ text: 'Inferred by the assistant, kept by you' })).toBeDefined()
    expect(await ui.find({ key: 'az-forget-fact:b' })).toBeDefined()
  })
}

test('forget asks first, cancel undoes', async ($, on) => {
  const w = world(on)
  w.snapshotJson = json([A, B])
  await $.session.start(START)
  const ui = await mount($)
  await ui.press({ key: 'az-forget-fact:a' })
  expect(await ui.find({ key: 'az-forget-yes-fact:a' })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: 'Forget this Fact?' }))?.props.color).toBe('error')
  expect(w.runs).toEqual([])
  await ui.press({ key: 'az-forget-no-fact:a' })
  expect(await ui.find({ key: 'az-forget-fact:a' })).toBeDefined()
  expect(await ui.find({ key: 'az-forget-yes-fact:a' })).toBeUndefined()
})

test('forget runs the kernel and keeps the row', async ($, on) => {
  const w = world(on)
  w.snapshotJson = json([A, B])
  w.responder = () => ({ exitCode: 0, stdout: 'forgot: fact:a — Never deploy on Fridays.\n' })
  await $.session.start(START)
  const ui = await mount($)
  await ui.press({ key: 'az-forget-fact:a' })
  w.snapshotJson = json([B])
  await ui.press({ key: 'az-forget-yes-fact:a' })
  expect(w.runs.at(-1)).toEqual({ argv: ['/w/a0', 'memory', 'forget', 'fact:a'], init: { cwd: '/w', timeoutMs: 10000 } })
  expect(await ui.find({ text: '1 active · 0 in hot set · 1 forgotten' })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: 'Never deploy on Fridays.' }))?.props.strikethrough).toBe(true)
  expect(await ui.find({ text: 'forgotten' })).toBeDefined()
  expect(await ui.find({ key: 'az-forget-fact:a' })).toBeUndefined()
})

test('a forgotten row survives a failed refresh', async ($, on) => {
  const w = world(on)
  w.snapshotJson = json([A, B])
  w.responder = () => ({ exitCode: 0, stdout: 'forgot: fact:a — Never deploy on Fridays.\n' })
  await $.session.start(START)
  const ui = await mount($)
  w.snapshotJson = 'not json'
  await ui.press({ key: 'az-forget-fact:a' })
  await ui.press({ key: 'az-forget-yes-fact:a' })
  expect(await ui.find({ text: '1 active · 0 in hot set · 1 forgotten' })).toBeDefined()
  expect(await ui.find({ text: 'forgotten' })).toBeDefined()
})

test('a failed forget shows the reason and offers Forget again', async ($, on) => {
  const w = world(on)
  w.snapshotJson = json([A, B])
  w.responder = () => ({ exitCode: 1, stderr: 'no active fact:a\nmore' })
  await $.session.start(START)
  const ui = await mount($)
  await ui.press({ key: 'az-forget-fact:a' })
  await ui.press({ key: 'az-forget-yes-fact:a' })
  expect((await ui.find({ type: 'Text', text: 'no active fact:a' }))?.props.color).toBe('error')
  expect(await ui.find({ key: 'az-forget-fact:a' })).toBeDefined()
})

test('a snapshot without a fact list says so', async ($, on) => {
  world(on)
  await $.session.start(START)
  expect(await (await mount($)).find({ text: 'memory unreadable (fact list)' })).toBeDefined()
})

test('no Facts: says so', async ($, on) => {
  const w = world(on)
  w.snapshotJson = json([])
  await $.session.start(START)
  expect(await (await mount($)).find({ text: 'No Facts yet.' })).toBeDefined()
})

test('the pane with no snapshot or no workspace', async ($, on) => {
  const w = world(on)
  w.snapshotJson = 'not json'
  await $.session.start(START)
  expect(await (await mount($)).find({ text: 'memory unreadable (unreadable snapshot)' })).toBeDefined()
})

test('the pane outside a workspace', async ($, on) => {
  world(on, { existing: [] })
  expect(await (await mount($)).find({ text: 'This is not an AgentZero workspace.' })).toBeDefined()
})

// A click into a pane gives it the keyboard; that redraw retires the button handles, so the
// click's press runs nothing (desktop log: "ui_press not handled", lab 2026-10-08). A pane
// opened with the keyboard is not redrawn by the first click.
test('every way of opening a pane asks for the keyboard', async ($, on) => {
  const w = world(on)
  await $.session.start(START)
  await $.command.run({ command: 'agentzero', args: 'memory' })
  await $.command.run({ command: 'agentzero', args: 'review' })
  const band = await $.ui.mount({ plugin: 'agentzero', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} } })
  await band.press({ key: 'az-memory' })
  await band.press({ key: 'az-review' })
  expect(w.opened).toEqual(['agentzero-memory', 'agentzero-review', 'agentzero-memory', 'agentzero-review'])
  expect(w.openFocus).toEqual([true, true, true, true])
})

// A row laid out side by side let a long line push the buttons out of the pane (lab, 2026-10-08).
test('each Fact is one column, with its words and its date on their own lines', async ($, on) => {
  const w = world(on)
  w.snapshotJson = json([A, B])
  await $.session.start(START)
  const ui = await mount($)
  expect(await ui.find({ type: 'Text', text: /^“周五别部署”$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Oct 6$/ })).toBeDefined()
  const boxes = (await ui.findAll({ type: 'Box' })).filter((b: any) => b.props.borderStyle === 'round')
  expect(boxes.length > 0).toBe(true)
  for (const b of boxes) expect(b.props.flexDirection).toBe('column')
})
