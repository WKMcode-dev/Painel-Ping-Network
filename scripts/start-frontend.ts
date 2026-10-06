import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { env } from '../backend/src/config/env.js'
import { waitForApi } from './wait-for-api.js'

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const frontend = resolve(project, 'frontend')
const requireFrontend = createRequire(resolve(frontend, 'package.json'))
const abort = new AbortController()
let child: ReturnType<typeof spawn> | undefined
const stop = () => {
  abort.abort()
  child?.kill('SIGTERM')
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
try {
  console.log(`Aguardando a API na porta ${env.PORT} antes de iniciar o frontend…`)
  await waitForApi(`http://127.0.0.1:${env.PORT}/api/health`, { signal: abort.signal })
  console.log('API pronta. Iniciando Vite…')
  // Launch through Node directly: no npm.cmd/shell quoting issues on Windows.
  child = spawn(
    process.execPath,
    [
      resolve(dirname(requireFrontend.resolve('vite/package.json')), 'bin/vite.js'),
      ...process.argv.slice(2),
    ],
    {
      cwd: frontend,
      stdio: 'inherit',
      env: { ...process.env, PORT: String(env.PORT) },
    },
  )
  child.on('error', (error) => {
    console.error(error.message)
    process.exitCode = 1
  })
  child.on('exit', (code) => {
    process.exitCode = abort.signal.aborted ? 0 : (code ?? 1)
  })
} catch (error) {
  if (!abort.signal.aborted) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
