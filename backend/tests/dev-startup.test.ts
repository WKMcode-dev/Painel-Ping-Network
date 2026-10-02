import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { waitForApi } from '../../scripts/wait-for-api.js'
import { wheelNavigation } from '../../frontend/src/utils/map-navigation.js'
import { worldPoint } from '../../frontend/src/utils/topology.js'

test('startup waits until the correct API is ready, not just an open port', async () => {
  let calls = 0
  const server = createServer((_req, res) => {
    calls++
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(calls < 3 ? { status: 'ok', application: 'different-service' } : { status: 'ok', application: 'painel-ping' }))
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  try {
    const port = (server.address() as { port: number }).port
    await waitForApi(`http://127.0.0.1:${port}/api/health`, { timeoutMs: 3000, retryMs: 5 })
    assert.equal(calls, 3)
  } finally { await new Promise<void>(done => server.close(() => done())) }
})
test('startup refuses an unhealthy backend with actionable timeout and honors cancellation', async () => {
  const server = createServer((_req, res) => { res.statusCode = 503; res.end('not ready') })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  try {
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/health`
    await assert.rejects(waitForApi(url, { timeoutMs: 100, retryMs: 5 }), /frontend não foi iniciado/)
    const abort = new AbortController(); abort.abort()
    await assert.rejects(waitForApi(url, { signal: abort.signal }), { name: 'AbortError' })
  } finally { await new Promise<void>(done => server.close(() => done())) }
})
test('pixel scrolling pans horizontally and vertically without changing zoom', () => {
  const view = { x: 100, y: 50, zoom: .8 }
  const event = { deltaX: 32, deltaY: -24, deltaMode: 0, ctrlKey: false, metaKey: false, shiftKey: false }
  assert.deepEqual(wheelNavigation(view, event, { x: 400, y: 300 }, 600), { action: 'pan', view: { x: 68, y: 74, zoom: .8 } })
  assert.deepEqual(wheelNavigation(view, { ...event, deltaX: 0, deltaY: 24, shiftKey: true }, { x: 400, y: 300 }, 600).view, { x: 76, y: 50, zoom: .8 })
})
test('pinch/Ctrl scrolling zooms around the pointer; line-mode mouse wheels retain zoom', () => {
  const view = { x: 100, y: 50, zoom: .8 }, point = { x: 400, y: 300 }
  const event = { deltaX: 0, deltaY: -24, deltaMode: 0, ctrlKey: true, metaKey: false, shiftKey: false }
  const result = wheelNavigation(view, event, point, 600)
  assert.equal(result.action, 'zoom'); assert.ok(result.view.zoom > .8)
  const before = worldPoint(point, view), after = worldPoint(point, result.view)
  assert.ok(Math.abs(before.x - after.x) < .00001 && Math.abs(before.y - after.y) < .00001)
  assert.equal(wheelNavigation(view, { ...event, ctrlKey: false, deltaMode: 1 }, point, 600).action, 'zoom')
})
