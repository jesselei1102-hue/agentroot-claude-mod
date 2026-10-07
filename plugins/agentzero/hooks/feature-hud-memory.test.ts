import { expect, test } from 'claude-code/testing'
import { SNAPSHOT, START, world } from './test-world'

const PANE = { title: 'AgentZero · Memory', isFocused: false, bodyColumns: 60, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 30 }, view: {} }
const A = { id: 'fact:a', sentence: 'Never deploy on Fridays.', said: '周五别部署', author: 'human', createdAt: '2026-10-06T10:17:00.000+08:00', scope: 'project', inHotSet: true }
const B = { id: 'fact:b', sentence: 'Deploys go out on Tuesdays.', said: null, author: 'agent', createdAt: '2026-10-03T14:30:00.000+08:00', scope: 'project', inHotSet: false }
const json = (facts: unknown) => JSON.stringify({ ...SNAPSHOT, facts })

async function mount($: any, surface: 'desktop' | 'terminal' = 'desktop') {
  return $.ui.mount({ plugin: 'agentzero', surface, component: 'Pane', props: PANE, requestId: 'agentzero-memory' })
}

async function sources(ui: any): Promise<string[]> {
  return (await ui.findAll({ type: 'Svg' })).map((s: any) => String(s.props.source))
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

test('the pane lists the Facts on desktop', async ($, on) => {
  const w = world(on)
  w.snapshotJson = json([A, B])
  await $.session.start(START)
  const ui = await mount($)
  const svgs = await sources(ui)
  expect(svgs[0]).toContain('2 active')
  expect(svgs[0]).toContain('1 in hot set')
  expect(svgs[1]).toContain('Never deploy on Fridays.')
  expect(svgs[2]).toContain('Inferred by the assistant, kept by you')
  expect(await ui.find({ key: 'az-forget-fact:a' })).toBeDefined()
})

test('the pane lists the Facts on terminal', async ($, on) => {
  const w = world(on)
  w.snapshotJson = json([A, B])
  await $.session.start(START)
  const ui = await mount($, 'terminal')
  expect(await ui.find({ text: 'Your memory · 2 active · 1 in hot set' })).toBeDefined()
  expect(await ui.find({ text: '10-06 10:17 [in hot set] Never deploy on Fridays.' })).toBeDefined()
  expect(await ui.find({ text: '  Your words: “周五别部署”' })).toBeDefined()
  expect(await ui.find({ key: 'az-forget-fact:b' })).toBeDefined()
})

test('forget asks first, cancel undoes', async ($, on) => {
  const w = world(on)
  w.snapshotJson = json([A, B])
  await $.session.start(START)
  const ui = await mount($)
  await ui.press({ key: 'az-forget-fact:a' })
  expect(await ui.find({ key: 'az-forget-yes-fact:a' })).toBeDefined()
  expect(await ui.find({ text: 'Forget this Fact?' })).toBeDefined()
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
  const svgs = await sources(ui)
  expect(svgs[0]).toContain('1 active')
  expect(svgs[0]).toContain('1 forgotten')
  expect(svgs[1]).toContain('✗ Forgotten')
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
  const svgs = await sources(ui)
  expect(svgs[0]).toContain('1 active')
  expect(svgs[1]).toContain('✗ Forgotten')
})

test('a failed forget shows the reason and offers Forget again', async ($, on) => {
  const w = world(on)
  w.snapshotJson = json([A, B])
  w.responder = () => ({ exitCode: 1, stderr: 'no active fact:a\nmore' })
  await $.session.start(START)
  const ui = await mount($)
  await ui.press({ key: 'az-forget-fact:a' })
  await ui.press({ key: 'az-forget-yes-fact:a' })
  expect((await sources(ui))[1]).toContain('no active fact:a')
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

// The desktop app drew a pane-only write one press late (lab, 2026-10-08): Forget and Cancel each
// needed two clicks, while ✗ Forget, which also refreshes the snapshot, needed one. So they refresh too.
test('Forget and Cancel refresh like the presses that run the kernel', async ($, on) => {
  const w = world(on)
  w.snapshotJson = json([A, B])
  await $.session.start(START)
  const ui = await mount($)
  const before = w.snapshotRuns.length
  await ui.press({ key: 'az-forget-fact:a' })
  expect(w.snapshotRuns.length).toBe(before + 1)
  await ui.press({ key: 'az-forget-no-fact:a' })
  expect(w.snapshotRuns.length).toBe(before + 2)
  expect(w.runs).toEqual([])
})
