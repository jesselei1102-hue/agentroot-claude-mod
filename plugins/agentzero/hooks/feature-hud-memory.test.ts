import { expect, test } from 'claude-code/testing'
import { SNAPSHOT, START, world } from './test-world'

const PANE = { title: 'AgentZero · Memory', isFocused: false, bodyColumns: 60, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 30 }, view: {} }
const A = { id: 'fact:a', sentence: 'Never deploy on Fridays.', said: '周五别部署', author: 'human', createdAt: '2026-10-06T10:17:00.000+08:00', scope: 'project', inHotSet: true }
const B = { id: 'fact:b', sentence: 'Deploys go out on Tuesdays.', said: null, author: 'agent', createdAt: '2026-10-03T14:30:00.000+08:00', scope: 'project', inHotSet: false }
const json = (facts: unknown) => JSON.stringify({ ...SNAPSHOT, facts })

async function allText(ui: { findAll: (q: { type: string }) => Promise<{ text?: string }[]> }) {
  return (await ui.findAll({ type: 'Text' })).map(t => String(t.text ?? '')).join('')
}

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
    expect(await allText(ui)).toContain('Active2In hot set1Waiting1')
    expect(await ui.find({ text: 'Never deploy on Fridays.' })).toBeDefined()
    expect(await ui.find({ text: '“周五别部署”' })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: '●' }))?.props.color).toBe('suggestion')
    expect(await ui.find({ text: 'Inferred by the assistant, kept by you' })).toBeDefined()
    expect(await ui.find({ key: 'az-forget-fact:b' })).toBeDefined()
  })
}

// One press: Restore undoes a forget, and in the desktop app every press after the first in a
// pane took two clicks (an engine fault), so a confirmation step cost the most (operator, 2026-10-08).
test('Forget runs at once, with no confirmation', async ($, on) => {
  const w = world(on)
  w.snapshotJson = json([A, B])
  w.responder = () => ({ exitCode: 0, stdout: 'forgot: fact:a — Never deploy on Fridays.\n' })
  await $.session.start(START)
  const ui = await mount($)
  await ui.press({ key: 'az-forget-fact:a' })
  expect(w.runs.at(-1)?.argv).toEqual(['/w/a0', 'memory', 'forget', 'fact:a'])
  expect(await ui.find({ text: 'Forget this Fact?' })).toBeUndefined()
  expect(await ui.find({ key: 'az-restore-fact:a' })).toBeDefined()
})

test('forget runs the kernel and keeps the row', async ($, on) => {
  const w = world(on)
  w.snapshotJson = json([A, B])
  w.responder = () => ({ exitCode: 0, stdout: 'forgot: fact:a — Never deploy on Fridays.\n' })
  await $.session.start(START)
  const ui = await mount($)
  w.snapshotJson = json([B])
  await ui.press({ key: 'az-forget-fact:a' })
  expect(w.runs.at(-1)).toEqual({ argv: ['/w/a0', 'memory', 'forget', 'fact:a'], init: { cwd: '/w', timeoutMs: 10000 } })
  expect(await allText(ui)).toContain('Active1In hot set0')
  expect(await allText(ui)).toContain('Forgotten · 1')
  expect((await ui.find({ type: 'Text', text: 'Never deploy on Fridays.' }))?.props.strikethrough).toBe(true)
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
  expect(await allText(ui)).toContain('Active1In hot set0')
  expect(await allText(ui)).toContain('Forgotten · 1')
})

test('a failed forget shows the reason and offers Forget again', async ($, on) => {
  const w = world(on)
  w.snapshotJson = json([A, B])
  w.responder = () => ({ exitCode: 1, stderr: 'no active fact:a\nmore' })
  await $.session.start(START)
  const ui = await mount($)
  await ui.press({ key: 'az-forget-fact:a' })
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

// A long line must never push Forget out of the pane (lab, 2026-10-08): the line beside it shrinks.
test('a Fact reads as its sentence, then its words and date beside Forget', async ($, on) => {
  const w = world(on)
  w.snapshotJson = json([A, B])
  await $.session.start(START)
  const ui = await mount($)
  expect(await ui.find({ type: 'Text', text: /^“周五别部署”$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Oct 6$/ })).toBeDefined()
  expect(await allText(ui)).toContain('In hot set · 1●Never deploy on Fridays.')
  expect(await allText(ui)).toContain('Other Facts · 1○Deploys go out on Tuesdays.')
  const shrinking = (await ui.findAll({ type: 'Box' })).filter((b: any) => b.props.flexShrink === 1 && b.props.minWidth === 0)
  expect(shrinking.length > 0).toBe(true)
})

// A bordered button takes the keyboard when clicked; the redraw that follows removes it, the
// keyboard falls back to the composer, and the next click into the pane is lost (desktop log,
// 2026-10-08: rc.3's plain buttons took one click, 1.3.0-rc.1's bordered ones two). Plain ones do not.
test('every button in both panes is plain', async ($, on) => {
  const w = world(on)
  w.snapshotJson = JSON.stringify({ ...SNAPSHOT, facts: [A, B] })
  await $.session.start(START)
  const memory = await mount($)
  const review = await $.ui.mount({ plugin: 'agentzero', surface: 'desktop', component: 'Pane', props: { ...PANE, title: 'AgentZero · Review' }, requestId: 'agentzero-review' })
  const buttons = [...(await memory.findAll({ type: 'Button' })), ...(await review.findAll({ type: 'Button' }))]
  expect(buttons.length).toBe(4)
  for (const b of buttons) expect([b.props.key, b.props.plain]).toEqual([b.props.key, true])
})

test('Restore brings a forgotten Fact back and offers Forget again', async ($, on) => {
  const w = world(on)
  w.snapshotJson = json([A, B])
  w.responder = argv => (String(argv[1]).endsWith('/tools/restore.py')
    ? { exitCode: 0, stdout: 'restored: fact:a — Never deploy on Fridays.\n' }
    : { exitCode: 0, stdout: 'forgot: fact:a — Never deploy on Fridays.\n' })
  await $.session.start(START)
  const ui = await mount($)
  w.snapshotJson = json([B])
  await ui.press({ key: 'az-forget-fact:a' })
  w.snapshotJson = json([A, B])
  await ui.press({ key: 'az-restore-fact:a' })
  const run = w.runs.at(-1)!
  expect(String(run.argv[1]).endsWith('/tools/restore.py')).toBe(true)
  expect(run.argv.slice(2)).toEqual(['/w', 'fact:a'])
  expect(await ui.find({ key: 'az-forget-fact:a' })).toBeDefined()
  expect(await ui.find({ key: 'az-restore-fact:a' })).toBeUndefined()
  expect(await allText(ui)).toContain('Active2In hot set1Waiting1')
})

test('a Restore that fails keeps the row forgotten and says why', async ($, on) => {
  const w = world(on)
  w.snapshotJson = json([A, B])
  w.responder = argv => (String(argv[1]).endsWith('/tools/restore.py')
    ? { exitCode: 1, stderr: 'a newer Fact replaced it: Deploy on Mondays.\n' }
    : { exitCode: 0, stdout: 'forgot: fact:a — x\n' })
  await $.session.start(START)
  const ui = await mount($)
  await ui.press({ key: 'az-forget-fact:a' })
  await ui.press({ key: 'az-restore-fact:a' })
  expect((await ui.find({ type: 'Text', text: 'a newer Fact replaced it: Deploy on Mondays.' }))?.props.color).toBe('error')
  expect(await ui.find({ key: 'az-restore-fact:a' })).toBeDefined()
})
