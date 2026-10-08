import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const stage = resolve(root, 'src-tauri/resources/runtime')
const backend = JSON.parse(await readFile(resolve(root, 'backend/package.json')))
await rm(stage, { recursive: true, force: true })
await mkdir(stage, { recursive: true })
// Runtime incluído: instalação e uso não exigem Node/npm na máquina do usuário.
await cp(process.execPath, resolve(stage, process.platform === 'win32' ? 'node.exe' : 'node'))
await cp(resolve(root, 'backend/dist'), resolve(stage, 'backend/dist'), { recursive: true })
await cp(resolve(root, 'backend/package.json'), resolve(stage, 'backend/package.json'))
await cp(resolve(root, 'frontend/dist'), resolve(stage, 'frontend/dist'), { recursive: true })
await writeFile(
  resolve(stage, 'package.json'),
  JSON.stringify({ private: true, dependencies: backend.dependencies }, null, 2),
)
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const options = { stdio: 'inherit', shell: process.platform === 'win32' }
// Apenas código/dependências: nunca .env, chave, inventário ou histórico.
const install = spawnSync(
  npm,
  ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'],
  { ...options, cwd: stage },
)
if (install.status !== 0) process.exit(install.status ?? 1)
// Uma única fonte vetorial gera os ícones da janela, bandeja e instaladores.
const icons = spawnSync(npm, ['exec', '--', 'tauri', 'icon', 'frontend/public/favicon.svg'], {
  ...options,
  cwd: root,
})
if (icons.status !== 0) process.exit(icons.status ?? 1)
