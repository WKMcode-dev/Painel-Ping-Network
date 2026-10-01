import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ConfigRepository } from '../src/repositories/config.repository.js'
import { initializeStorage, acquireStorageLock } from '../src/storage/initialize-storage.js'
import { resolveDataDirectory } from '../src/storage/data-directory.js'

const config = { hosts: [{ id: 'router', name: 'Minha infraestrutura', address: '10.10.0.1', group: 'TI', location: '', enabled: true }], failureThreshold: 3, recoveryThreshold: 2 }
const topology = { revision: 8, graph: { nodes: [{ id: 'host:router', hostId: 'router', label: 'Minha infraestrutura', x: 24, y: 48, color: 'blue', shape: 'ellipse', fill: '#abcdef' }], edges: [], appearance: { background: '#ffffff', showGrid: false } } }
const history = [{ id: 'event', hostId: 'router', type: 'down', timestamp: new Date().toISOString(), durationMs: null, message: 'Queda' }]
const dataset = { 'config.json': config, 'topology.json': topology, 'status-history.json': history }
async function createDataset(path: string, data = dataset) {
  await mkdir(path, { recursive: true })
  for (const [name, value] of Object.entries(data)) await writeFile(join(path, name), JSON.stringify(value))
}
async function fixture(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'ping-storage-'))
  try { await run(root) } finally { await rm(root, { recursive: true, force: true }) }
}
const silent = () => {}

test('persistent directory belongs to the OS user, with absolute override', () => {
  assert.equal(resolveDataDirectory('win32', { LOCALAPPDATA: '/local' }, '/user'), join('/local', 'PainelPing', 'data'))
  assert.equal(resolveDataDirectory('linux', { XDG_DATA_HOME: '/xdg' }, '/user'), join('/xdg', 'painel-ping', 'data'))
  assert.equal(resolveDataDirectory('linux', {}, '/user'), join('/user', '.local', 'share', 'painel-ping', 'data'))
  assert.equal(resolveDataDirectory('linux', { DATA_DIR: join(tmpdir(), 'custom') }, '/user'), join(tmpdir(), 'custom'))
  assert.throws(() => resolveDataDirectory('linux', { DATA_DIR: './version/storage' }), /absoluto/)
})

test('new release migrates sibling version atomically, preserves originals and takes a backup', async () => fixture(async root => {
  const previous = join(root, 'Painel-Ping-v1.9.0', 'backend', 'storage'), projectRoot = join(root, 'Painel-Ping-v1.9.1'), directory = join(root, 'fixed', 'data')
  await mkdir(projectRoot); await createDataset(previous)
  assert.deepEqual(await initializeStorage({ directory, projectRoot, log: silent }), { migratedFrom: previous })
  for (const name of Object.keys(dataset)) {
    const original = await readFile(join(previous, name), 'utf8')
    assert.equal(await readFile(join(directory, name), 'utf8'), original)
    assert.equal(await readFile(join(directory, 'backups', 'before-migration', name), 'utf8'), original)
  }
  assert.equal((await readdir(join(root, 'fixed'))).some(n => n.includes('.migration-')), false)
  // Updating in the new release must win over older datasets on every later launch.
  const updated = { ...config, failureThreshold: 7 }
  await writeFile(join(directory, 'config.json'), JSON.stringify(updated))
  const next = join(root, 'Painel-Ping-v1.9.2'); await mkdir(next)
  assert.deepEqual(await initializeStorage({ directory, projectRoot: next, legacyDirectory: previous, log: silent }), { migratedFrom: null })
  assert.deepEqual(JSON.parse(await readFile(join(directory, 'config.json'), 'utf8')), updated)
}))

test('migration discovers ZIP wrapper directories and coalesces identical datasets', async () => fixture(async root => {
  const projectRoot = join(root, 'Painel-Ping-v1.9.1', 'Painel-Ping-v1.9.1'), directory = join(root, 'fixed', 'data')
  await mkdir(projectRoot, { recursive: true })
  await createDataset(join(root, 'Painel-Ping-v1.8.0', 'backend', 'storage'))
  await createDataset(join(root, 'Painel-Ping-v1.9.0', 'Painel-Ping-v1.9.0', 'backend', 'storage'))
  assert.ok((await initializeStorage({ directory, projectRoot, log: silent })).migratedFrom)
  assert.deepEqual(JSON.parse(await readFile(join(directory, 'config.json'), 'utf8')), config)
}))

test('different legacy datasets block startup rather than reset or mix infrastructure; explicit source resolves it', async () => fixture(async root => {
  const projectRoot = join(root, 'Painel-Ping-v1.9.1'), directory = join(root, 'fixed', 'data')
  const old = join(root, 'Painel-Ping-v1.8.0', 'backend', 'storage'), chosen = join(root, 'Painel-Ping-v1.9.0', 'backend', 'storage')
  await mkdir(projectRoot); await createDataset(old)
  const updated = { ...dataset, 'config.json': { ...config, failureThreshold: 9 } }
  await createDataset(chosen, updated)
  await assert.rejects(initializeStorage({ directory, projectRoot, log: silent }), /LEGACY_DATA_DIR/)
  await assert.rejects(readFile(join(directory, 'config.json')), { code: 'ENOENT' })
  await initializeStorage({ directory, projectRoot, legacyDirectory: chosen, log: silent })
  assert.deepEqual(JSON.parse(await readFile(join(directory, 'config.json'), 'utf8')), updated['config.json'])
}))

test('invalid or absent explicit migration source never creates a fresh dataset', async () => fixture(async root => {
  const projectRoot = join(root, 'Painel-Ping-v1.9.1'), directory = join(root, 'fixed', 'data'), source = join(root, 'old')
  await mkdir(projectRoot); await createDataset(source)
  await writeFile(join(source, 'config.json'), '{broken')
  await assert.rejects(initializeStorage({ directory, projectRoot, legacyDirectory: source, log: silent }))
  await assert.rejects(readFile(join(directory, 'config.json')), { code: 'ENOENT' })
  await assert.rejects(initializeStorage({ directory, projectRoot, legacyDirectory: join(root, 'missing'), log: silent }), /Nenhum arquivo/)
  await rm(join(source, 'config.json'))
  await assert.rejects(initializeStorage({ directory, projectRoot, legacyDirectory: source, log: silent }), /config.json está ausente/)
}))

test('empty first installation can import explicit legacy data before monitoring files exist', async () => fixture(async root => {
  const projectRoot = join(root, 'Painel-Ping-v1.9.1'), directory = join(root, 'fixed', 'data'), source = join(root, 'elsewhere')
  await mkdir(projectRoot); await mkdir(directory, { recursive: true })
  await initializeStorage({ directory, projectRoot, log: silent })
  await createDataset(source)
  await initializeStorage({ directory, projectRoot, legacyDirectory: source, log: silent })
  assert.deepEqual(JSON.parse(await readFile(join(directory, 'config.json'), 'utf8')), config)
}))

test('fixed storage refuses a second backend and releases the lock for the next version', async () => fixture(async root => {
  const directory = join(root, 'fixed', 'data')
  const release = await acquireStorageLock(directory)
  await assert.rejects(acquireStorageLock(directory), /Outra instância/)
  await release()
  const nextRelease = await acquireStorageLock(directory)
  await nextRelease()
}))


test('first-run inventory is persisted so future versions cannot replace it with new examples', async () => fixture(async root => {
  const path = join(root, 'data', 'config.json'), repository = new ConfigRepository(path)
  const initial = await repository.load()
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), initial)
  const changed = { ...initial, hosts: [] }
  await repository.save(changed)
  assert.deepEqual(await new ConfigRepository(path).load(), changed)
}))
