import { expect, test } from 'claude-code/testing'
import { PROMPT, SNAPSHOT, START, world } from './test-world'

const PANE = { title: 'AgentZero · Memory', isFocused: false, bodyColumns: 140, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 30 }, view: {} }
const A = { id: 'fact:a', sentence: 'Never deploy on Fridays.', said: '周五别部署', author: 'human', createdAt: '2026-10-06T10:17:00.000+08:00', scope: 'project', inHotSet: true }
const B = { id: 'fact:b', sentence: 'Deploys go out on Tuesdays.', said: null, author: 'agent', createdAt: '2026-10-03T14:30:00.000+08:00', scope: 'project', inHotSet: false }
const json = (facts: unknown) => JSON.stringify({ ...SNAPSHOT, facts })

async function allText(ui: { findAll: (q: { type: string }) => Promise<{ text?: string }[]> }) {
  return (await ui.findAll({ type: 'Text' })).map(t => String(t.text ?? '')).join('')
}

async function mount($: any, surface: 'desktop' | 'terminal' = 'desktop') {
  return $.ui.mount({ plugin: 'agentzero', surface, component: 'Pane', props: PANE, requestId: 'agentzero-memory' })
}

async function cluster(ui: any): Promise<string> {
  return String((await ui.find({ type: 'Svg' }))?.props.source ?? '')
}

// The kit hands back no `hover` (a surface-side style), so a hover row is its display: 'none' Box.
async function hoverBoxes(ui: any) {
  return (await ui.findAll({ type: 'Box' })).filter((b: any) => b.props.display === 'none')
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
  test(`Memory pane sections and rows on ${surface}`, async ($, on) => {
    const w = world(on)
    w.snapshotJson = json([A, B])
    await $.session.start(START)
    const ui = await mount($, surface)
    const t = await allText(ui)
    expect(t).toContain('LOADED NOW · 1')
    expect(t).toContain('NOT LOADED · 1')
    expect(t).toContain('●Never deploy on Fridays.❝ yours')
    expect(t).toContain('○Deploys go out on Tuesdays.◇ inferred')
    expect((await ui.find({ type: 'Text', text: '●' }))?.props.color).toBe('suggestion')
    expect(await ui.find({ key: 'az-forget-fact:a' })).toBeDefined()
    expect(await ui.find({ key: 'az-forget-fact:b' })).toBeDefined()
  })
}

test('desktop: a cluster SVG, details on hover', async ($, on) => {
  const w = world(on)
  w.snapshotJson = json([A, B])
  await $.session.start(START)
  const ui = await mount($)
  const svg = await cluster(ui)
  expect(svg).toContain('LOADED')
  expect(svg).toContain('1 / 2')
  expect(svg).toContain('width="798"')
  expect((await hoverBoxes(ui)).length).toBe(2)
})

test('terminal: text gauges, details always shown', async ($, on) => {
  const w = world(on)
  w.snapshotJson = json([A, B])
  await $.session.start(START)
  const ui = await mount($, 'terminal')
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  expect(await allText(ui)).toContain('LOADED ▰▰▰▱▱ 1/2')
  expect((await ui.findAll({ type: 'Box' })).some((b: any) => b.props.display === 'none')).toBe(false)
  expect(await allText(ui)).toContain('“周五别部署”')
})

test('Loaded counts Facts in the hot set, not the hot set ids', async ($, on) => {
  const w = world(on)
  w.snapshotJson = JSON.stringify({ ...SNAPSHOT, hotSet: { at: SNAPSHOT.hotSet.at, factIds: ['fact:gone', 'fact:a'] }, facts: [A, B] })
  await $.session.start(START)
  expect(await cluster(await mount($))).toContain('1 / 2')
})

test('a Fact that replaced an older one shows ↺ and the older words on hover', async ($, on) => {
  const w = world(on)
  w.snapshotJson = json([{ ...A, factKey: 'deploys', replaces: 'Deploy any day.' }, B])
  await $.session.start(START)
  const t = await allText(await mount($))
  expect(t).toContain('↺')
  expect(t).toContain('Replaced “Deploy any day.”')
})

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
  expect(await cluster(ui)).toContain('0 / 1')
  expect(await allText(ui)).toContain('FORGOTTEN · 1')
  expect((await hoverBoxes(ui)).length).toBe(1)
  expect(await ui.find({ key: 'az-restore-fact:a' })).toBeDefined()
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
  expect(await allText(ui)).toContain('FORGOTTEN · 1')
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
  expect(await cluster(ui)).toContain('1 / 2')
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

// Review: the band said the hot set failed while the pane still claimed "loaded at 14:02".
test('a failed hot set shows in the pane, as in the band', async ($, on) => {
  const w = world(on)
  w.snapshotJson = json([A, B])
  await $.session.start(START)
  w.setRun({ exitCode: 1, stdout: '' })
  await $.prompt.submit(PROMPT('one'))
  const ui = await mount($)
  expect((await ui.find({ type: 'Text', text: 'not loaded (exit 1)' }))?.props.color).toBe('error')
  expect(await cluster(ui)).toContain('not loaded (exit 1)')
})
