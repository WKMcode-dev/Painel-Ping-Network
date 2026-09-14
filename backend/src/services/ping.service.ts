import { spawn } from 'node:child_process'
import { env } from '../config/env.js'
import type { PingResult } from '../types/monitor.js'
import { isValidHost } from '../utils/host-validation.js'

import { parsePing } from '../utils/ping-parser.js'

export class PingService {
  async probe(address: string): Promise<PingResult> {
    const checkedAt = new Date().toISOString()

    if (!isValidHost(address)) {
      return { alive: false, latencyMs: null, ttl: null, checkedAt, probeError: true, error: 'Endereço inválido' }
    }

    const isWindows = process.platform === 'win32'
    const command = isWindows ? 'ping.exe' : 'ping'
    const args = isWindows
      ? ['-n', '1', '-w', String(env.PING_TIMEOUT_MS), address]
      : ['-n', '-c', '1', '-W', String(Math.max(1, Math.ceil(env.PING_TIMEOUT_MS / 1000))), address]

    return new Promise((resolve) => {
      const child = spawn(command, args, { shell: false, windowsHide: true, env: { ...process.env, LC_ALL: 'C' } })
      let output = ''
      let errorOutput = ''
      let settled = false

      const finish = (result: PingResult) => {
        if (settled) return
        settled = true
        resolve(result)
      }

      const timeout = setTimeout(() => {
        child.kill()
        finish({ alive: false, latencyMs: null, ttl: null, checkedAt, error: 'Tempo limite excedido' })
      }, env.PING_TIMEOUT_MS + 750)

      child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString() })
      child.stderr.on('data', (chunk: Buffer) => { errorOutput += chunk.toString() })
      child.on('error', (error) => {
        clearTimeout(timeout)
        finish({ alive: false, latencyMs: null, ttl: null, checkedAt, probeError: true, error: `Falha no coletor: ${error.message}` })
      })
      child.on('close', (code) => {
        clearTimeout(timeout)
        const parsed = parsePing(output, code, isWindows)
        const localError = !isWindows && code === 2
        finish({ ...parsed, checkedAt, probeError: localError,
          error: localError ? `Falha no coletor: ${errorOutput.trim() || output.trim()}` : parsed.error })
      })
    })
  }
}
