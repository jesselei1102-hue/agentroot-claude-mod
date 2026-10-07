import { expect, test } from 'claude-code/testing'
import type { Fact, MemoryResult, MemoryResults } from '../types'
import { MEMORY_ROW_CAP, cancelForget, forgetArgv, forgetResult, memoryRows, mergeMemory } from './memory'

const fact = (id: string, createdAt: string | null, inHotSet = false): Fact => ({
  id: `fact:${id}`, sentence: id, said: null, author: 'human', createdAt, scope: 'project', inHotSet,
})
const a = fact('a', '2026-10-06T10:00:00+08:00', true)
const b = fact('b', '2026-10-05T10:00:00+08:00', true)
const c = fact('c', '2026-10-04T10:00:00+08:00')
const result = (f: Fact, outcome: MemoryResult['outcome'], message = ''): MemoryResult => ({ fact: f, outcome, message, citedBy: [] })

test('rows: all active, counts', () => {
  const m = memoryRows([a, b, c], {})
  expect(m.rows.map(r => [r.fact.id, r.state, r.actionable])).toEqual([
    ['fact:a', 'active', true], ['fact:b', 'active', true], ['fact:c', 'active', true],
  ])
  expect([m.active, m.inHotSet, m.forgotten, m.hidden]).toEqual([3, 2, 0, 0])
})

test('rows: confirming and failed show their state', () => {
  const m = memoryRows([a, b], { 'fact:a': result(a, 'confirming'), 'fact:b': result(b, 'failed', 'no active fact:b') })
  expect(m.rows.map(r => [r.state, r.message, r.actionable])).toEqual([['confirming', null, false], ['failed', 'no active fact:b', true]])
})

test('rows: a forgotten Fact that left the snapshot stays in its place', () => {
  const m = memoryRows([a, c], { 'fact:b': result(b, 'forgotten') })
  expect(m.rows.map(r => [r.fact.id, r.state])).toEqual([['fact:a', 'active'], ['fact:b', 'forgotten'], ['fact:c', 'active']])
  expect([m.active, m.forgotten]).toEqual([2, 1])
})

test('rows: forgotten while still in the snapshot is not counted', () => {
  const m = memoryRows([a, b], { 'fact:b': result(b, 'forgotten') })
  expect([m.active, m.inHotSet, m.forgotten]).toEqual([1, 1, 1])
  expect(m.rows[1].actionable).toBe(false)
})

test('rows: a confirming Fact that left the snapshot is dropped', () => {
  expect(memoryRows([a], { 'fact:b': result(b, 'confirming') }).rows.map(r => r.fact.id)).toEqual(['fact:a'])
})

test('rows: a failed Fact that left the snapshot stays, without Forget', () => {
  const [, row] = memoryRows([a], { 'fact:b': result(b, 'failed', 'no active fact:b') }).rows
  expect([row.state, row.message, row.actionable]).toEqual(['failed', 'no active fact:b', false])
})

test('rows: no date sorts last', () => {
  const n = fact('n', null)
  expect(memoryRows([n, a], {}).rows.map(r => r.fact.id)).toEqual(['fact:a', 'fact:n'])
})

test('rows: cap at 200', () => {
  const many = Array.from({ length: 205 }, (_, i) => fact(`f${i}`, `2026-10-06T10:00:${String(i % 60).padStart(2, '0')}+08:00`))
  const m = memoryRows(many, {})
  expect(MEMORY_ROW_CAP).toBe(200)
  expect([m.rows.length, m.hidden, m.active]).toEqual([200, 5, 205])
})

test('merge: a failure never replaces a forget', () => {
  const done: MemoryResults = { 'fact:a': result(a, 'forgotten') }
  expect(mergeMemory(done, result(a, 'failed', 'no active fact:a'))).toBe(done)
})

test('merge: a forget replaces confirming and failed', () => {
  const forgot = result(a, 'forgotten')
  expect(mergeMemory({ 'fact:a': result(a, 'confirming') }, forgot)['fact:a']).toBe(forgot)
  expect(mergeMemory({ 'fact:a': result(a, 'failed', 'x') }, forgot)['fact:a']).toBe(forgot)
})

test('cancelForget removes the entry', () => {
  expect(cancelForget({ 'fact:a': result(a, 'confirming'), 'fact:b': result(b, 'forgotten') }, 'fact:a')).toEqual({ 'fact:b': result(b, 'forgotten') })
})

test('forgetArgv', () => {
  expect(forgetArgv('/w', 'fact:a')).toEqual(['/w/a0', 'memory', 'forget', 'fact:a'])
})

test('forgetResult: success', () => {
  expect(forgetResult(a, { exitCode: 0, stdout: 'forgot: fact:a — a\n', stderr: '' })).toEqual(result(a, 'forgotten'))
})

test('forgetResult: cited by a skill', () => {
  const ran = { exitCode: 0, stdout: 'forgot: fact:a — a\n  skill:deploy-check cites it (fact:a); lint reports that …\n', stderr: '' }
  expect(forgetResult(a, ran).citedBy).toEqual(['deploy-check'])
})

test('forgetResult: failures', () => {
  expect(forgetResult(a, { exitCode: 1, stdout: '', stderr: 'no active fact:a\nmore' })).toEqual(result(a, 'failed', 'no active fact:a'))
  expect(forgetResult(a, { exitCode: 0, stdout: 'something else\n', stderr: '' })).toEqual(result(a, 'failed', 'something else'))
  expect(forgetResult(a, { exitCode: 2, stdout: '', stderr: '' }).message).toBe('exit 2')
  expect(forgetResult(a, new Error('timed out after 10000 ms')).message).toBe('timed out')
  expect(forgetResult(a, new Error('denied')).message).toBe('could not run')
})
