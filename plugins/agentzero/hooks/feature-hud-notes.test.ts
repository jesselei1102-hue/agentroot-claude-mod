import { expect, test } from 'claude-code/testing'
import { MSG, PROMPT, SNAPSHOT, START, world } from './test-world'

const MEMORY = { title: 'AgentZero · Memory', isFocused: false, bodyColumns: 60, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 30 }, view: {} }
const REVIEW = { ...MEMORY, title: 'AgentZero · Review' }
const A = { id: 'fact:x', sentence: 'Never deploy on Fridays.', said: '周五别部署', author: 'human', createdAt: '2026-10-06T10:17:00.000+08:00', scope: 'project', inHotSet: true }
const NOTE = 'AgentZero: since your last message'
const HOT = 'AgentZero hot set, loaded by the Claude Code plugin'

// The kernel as the tests need it: hot-set prints a hot set; forget and review answer `answer`.
function kernel(w: ReturnType<typeof world>, answer: { exitCode: number; stdout?: string; stderr?: string }) {
  w.snapshotJson = JSON.stringify({ ...SNAPSHOT, facts: [A] })
  w.responder = argv => (argv[2] === 'hot-set' ? { exitCode: 0, stdout: '## Facts (1)\n' } : answer)
}

const last = (w: ReturnType<typeof world>) => (w.contexts.at(-1) ?? []).join('\n')

async function forgetX($: any) {
  const ui = await $.ui.mount({ plugin: 'agentzero', surface: 'desktop', component: 'Pane', props: MEMORY, requestId: 'agentzero-memory' })
  await ui.press({ key: 'az-forget-fact:x' })
}

async function review($: any, key: string) {
  const ui = await $.ui.mount({ plugin: 'agentzero', surface: 'desktop', component: 'Pane', props: REVIEW, requestId: 'agentzero-review' })
  await ui.press({ key })
}

test('a forget puts a note on the next prompt only', async ($, on) => {
  const w = world(on)
  kernel(w, { exitCode: 0, stdout: 'forgot: fact:x — Never deploy on Fridays.\n' })
  await $.session.start(START)
  await $.prompt.submit(PROMPT('one'))
  await forgetX($)
  await $.prompt.submit(PROMPT('two'))
  expect(last(w)).toContain(`${NOTE}, the operator changed the memory in the plugin's panes.\nForgotten, stop applying: "Never deploy on Fridays."`)
  await $.prompt.submit(PROMPT('three'))
  expect(last(w)).not.toContain(NOTE)
})

test('a keep in the Review pane is noted', async ($, on) => {
  const w = world(on)
  kernel(w, { exitCode: 0, stdout: 'confirmed: fact:a — 周五不部署\n' })
  await $.session.start(START)
  await $.prompt.submit(PROMPT('one'))
  await review($, 'az-keep-fact:a')
  await $.prompt.submit(PROMPT('two'))
  expect(last(w)).toContain('Kept, now active: fact "周五不部署"')
})

test('a reject in the Review pane is noted', async ($, on) => {
  const w = world(on)
  kernel(w, { exitCode: 0, stdout: 'rejected: fact:a — 周五不部署\n' })
  await $.session.start(START)
  await $.prompt.submit(PROMPT('one'))
  await review($, 'az-reject-fact:a')
  await $.prompt.submit(PROMPT('two'))
  expect(last(w)).toContain('Rejected: fact "周五不部署"')
})

test('a failed press adds no note', async ($, on) => {
  const w = world(on)
  kernel(w, { exitCode: 1, stderr: 'no active fact:x' })
  await $.session.start(START)
  await $.prompt.submit(PROMPT('one'))
  await forgetX($)
  await review($, 'az-keep-fact:a')
  await $.prompt.submit(PROMPT('two'))
  expect(last(w)).not.toContain(NOTE)
})

// The old hot set, or a compaction summary, can still hold the forgotten Fact: say so even then.
test('a prompt that loads the hot set still carries the note', async ($, on) => {
  const w = world(on)
  kernel(w, { exitCode: 0, stdout: 'forgot: fact:x — Never deploy on Fridays.\n' })
  await $.session.start(START)
  await $.prompt.submit(PROMPT('one'))
  await forgetX($)
  await $.session.compact({ trigger: 'manual', messages: [MSG] })
  await $.prompt.submit(PROMPT('two'))
  expect(last(w)).toContain(HOT)
  expect(last(w)).toContain('Forgotten, stop applying: "Never deploy on Fridays."')
  await $.prompt.submit(PROMPT('three'))
  expect(last(w)).not.toContain(NOTE)
})

test('a failed hot-set load still carries the note', async ($, on) => {
  const w = world(on)
  kernel(w, { exitCode: 0, stdout: 'forgot: fact:x — Never deploy on Fridays.\n' })
  await $.session.start(START)
  await $.prompt.submit(PROMPT('one'))
  await forgetX($)
  await $.session.compact({ trigger: 'manual', messages: [MSG] })
  w.responder = argv => (argv[2] === 'hot-set' ? { exitCode: 1, stdout: '' } : { exitCode: 0 })
  await $.prompt.submit(PROMPT('two'))
  expect(last(w)).toContain('Forgotten, stop applying: "Never deploy on Fridays."')
})

test('a forget undone by Restore before the next prompt says nothing', async ($, on) => {
  const w = world(on)
  kernel(w, { exitCode: 0, stdout: 'forgot: fact:x — Never deploy on Fridays.\n' })
  const base = w.responder!
  w.responder = argv => (String(argv[1]).endsWith('/tools/restore.py') ? { exitCode: 0, stdout: 'restored: fact:x — Never deploy on Fridays.\n' } : base(argv))
  await $.session.start(START)
  await $.prompt.submit(PROMPT('one'))
  const ui = await $.ui.mount({ plugin: 'agentzero', surface: 'desktop', component: 'Pane', props: MEMORY, requestId: 'agentzero-memory' })
  await ui.press({ key: 'az-forget-fact:x' })
  await ui.press({ key: 'az-restore-fact:x' })
  await $.prompt.submit(PROMPT('two'))
  expect(last(w)).not.toContain(NOTE)
})
