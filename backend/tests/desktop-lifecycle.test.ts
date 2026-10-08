import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import { setImmediate } from 'node:timers/promises'
import { attachDesktopShutdown } from '../src/services/desktop-lifecycle.js'

test('desktop shutdown followed by EOF waits for the same pending flush', async () => {
  const input = new PassThrough()
  let finish!: () => void
  let calls = 0
  const exits: number[] = []
  attachDesktopShutdown(
    input,
    () => {
      calls++
      return new Promise<void>((resolve) => {
        finish = resolve
      })
    },
    (code) => exits.push(code),
  )
  input.end('shutdown\n')
  await setImmediate()
  assert.equal(calls, 1)
  assert.deepEqual(exits, [])
  finish()
  await setImmediate()
  assert.deepEqual(exits, [0])
})
test('loss of desktop stdin requests graceful shutdown without a command', async () => {
  const input = new PassThrough(),
    exits: number[] = []
  let stopped = false
  attachDesktopShutdown(
    input,
    async () => {
      stopped = true
    },
    (code) => exits.push(code),
  )
  input.end()
  await setImmediate()
  assert.equal(stopped, true)
  assert.deepEqual(exits, [0])
})
test('flush failure exits unsuccessfully instead of claiming graceful shutdown', async () => {
  const input = new PassThrough(),
    exits: number[] = []
  attachDesktopShutdown(
    input,
    async () => {
      throw new Error('Disk failure')
    },
    (code) => exits.push(code),
  )
  input.end('shutdown\n')
  await setImmediate()
  assert.deepEqual(exits, [1])
})
