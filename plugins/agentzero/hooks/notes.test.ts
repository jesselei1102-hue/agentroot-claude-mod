import { expect, test } from 'claude-code/testing'
import { paneNoteText } from './notes'

const FIRST = "AgentZero: since your last message, the operator changed the memory in the plugin's panes."

test('empty → null', () => {
  expect(paneNoteText([])).toBeNull()
})

test('one forget', () => {
  expect(paneNoteText([{ verb: 'forgot', kind: 'fact', sentence: 'Never deploy on Fridays.' }])).toBe(
    `${FIRST}\nForgotten, stop applying: "Never deploy on Fridays."`,
  )
})

test('all three verbs, two forgets', () => {
  const text = paneNoteText([
    { verb: 'rejected', kind: 'episode', sentence: 'B' },
    { verb: 'forgot', kind: 'fact', sentence: 'X' },
    { verb: 'kept', kind: 'fact', sentence: 'A' },
    { verb: 'forgot', kind: 'fact', sentence: 'Y' },
  ])
  expect(text).toBe([FIRST, 'Forgotten, stop applying: "X"; "Y"', 'Kept, now active: fact "A"', 'Rejected: episode "B"'].join('\n'))
})

test('a restore is its own line', () => {
  expect(paneNoteText([{ verb: 'restored', kind: 'fact', sentence: 'Use pnpm.' }])).toBe(`${FIRST}\nRestored, apply again: "Use pnpm."`)
})
