import { spawnSync } from 'node:child_process'
const bundles =
  process.platform === 'win32' ? 'nsis' : process.platform === 'linux' ? 'deb,appimage' : null
if (!bundles) throw new Error('Distribuição homologada somente para Windows e Linux.')
const result = spawnSync(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['exec', '--', 'tauri', 'build', '--bundles', bundles, ...process.argv.slice(2)],
  { stdio: 'inherit', shell: process.platform === 'win32' },
)
process.exit(result.status ?? 1)
