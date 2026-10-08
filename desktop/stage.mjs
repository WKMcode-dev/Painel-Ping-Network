import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const stage = resolve(root, 'desktop/staging')
const backend = JSON.parse(await readFile(resolve(root, 'backend/package.json')))
const version = JSON.parse(await readFile(resolve(root, 'package.json'))).version
await rm(stage, { recursive: true, force: true })
await mkdir(stage, { recursive: true })
await cp(resolve(root, 'backend/dist'), resolve(stage, 'backend/dist'), { recursive: true })
await cp(resolve(root, 'backend/package.json'), resolve(stage, 'backend/package.json'))
await cp(resolve(root, 'frontend/dist'), resolve(stage, 'frontend/dist'), { recursive: true })
await mkdir(resolve(stage, 'desktop'))
await cp(resolve(root, 'desktop/main.cjs'), resolve(stage, 'desktop/main.cjs'))
await cp(resolve(root, 'desktop/admin-key.cjs'), resolve(stage, 'desktop/admin-key.cjs'))
await cp(resolve(root, 'desktop/tray.png'), resolve(stage, 'desktop/tray.png'))
await writeFile(
  resolve(stage, 'package.json'),
  JSON.stringify(
    {
      name: 'painel-ping-desktop',
      productName: 'Painel Ping',
      version,
      description: 'Monitoramento de rede ICMP, serviços e SNMP',
      author: 'WKMcode-dev',
      homepage: 'https://github.com/WKMcode-dev/Painel-Ping-Network',
      main: 'desktop/main.cjs',
      dependencies: backend.dependencies,
    },
    null,
    2,
  ),
)
// Instala apenas dependências de execução; não inclui .env, inventário ou chave administrativa.
const result = spawnSync(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'],
  { cwd: stage, stdio: 'inherit', shell: process.platform === 'win32' },
)
if (result.status !== 0) process.exit(result.status ?? 1)
