import { spawn } from 'node:child_process'
import { cp, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
const target = resolve('src-tauri/target/release')
await mkdir(target, { recursive: true })
await cp('src-tauri/resources/runtime', resolve(target, 'runtime'), { recursive: true })
const child = spawn(
  resolve(target, process.platform === 'win32' ? 'painel-ping-desktop.exe' : 'painel-ping-desktop'),
  ['--smoke-test'],
  { stdio: 'inherit' },
)
const timeout = setTimeout(() => {
  child.kill()
  process.exitCode = 1
}, 115000)
child.on('error', (e) => {
  console.error(e.message)
  clearTimeout(timeout)
  process.exitCode = 1
})
child.on('exit', (code) => {
  clearTimeout(timeout)
  process.exitCode = code ?? 1
})
