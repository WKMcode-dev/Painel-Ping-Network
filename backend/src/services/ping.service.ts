import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
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

    let target = address
    if (!isIP(address)) {
      let timer: ReturnType<typeof setTimeout> | undefined
      try { target = await Promise.race([lookup(address).then(result => result.address), new Promise<string>((_, reject) => { timer = setTimeout(() => reject(new Error('DNS excedeu o tempo limite')), env.PING_TIMEOUT_MS) })]) }
      catch (error) { return { alive: false, latencyMs: null, ttl: null, checkedAt, probeError: true, error: `DNS indisponível: ${String(error)}` } }
      finally { clearTimeout(timer) }
    }
    const isWindows = process.platform === 'win32'
    const command = isWindows ? 'ping.exe' : 'ping'
    const args = isWindows
      ? ['-n', '1', '-w', String(env.PING_TIMEOUT_MS), target]
      : ['-n', '-c', '1', '-W', String(Math.max(1, Math.ceil(env.PING_TIMEOUT_MS / 1000))), target]

    return new Promise((resolve) => {
      const child = spawn(command, args, { shell: false, windowsHide: true, env: { ...process.env, LC_ALL: 'C' } })
      let output = ''
      let errorOutput = ''
      let settled = false

      const finish = (result: PingResult) => {
        if (settled) return
        settled = true
        resolve({ ...result, checkedAt: new Date().toISOString(), resolvedAddress: target })
      }

      const timeout = setTimeout(() => {
        child.kill()
        finish({ alive: false, latencyMs: null, ttl: null, checkedAt, probeError: true, error: 'Coletor ICMP não concluiu no prazo' })
      }, env.PING_TIMEOUT_MS + 750)

      child.stdout.on('data', (chunk: Buffer) => { output = (output + chunk.toString()).slice(-65536) })
      child.stderr.on('data', (chunk: Buffer) => { errorOutput = (errorOutput + chunk.toString()).slice(-65536) })
      child.on('error', (error) => {
        clearTimeout(timeout)
        finish({ alive: false, latencyMs: null, ttl: null, checkedAt, probeError: true, error: `Falha no coletor: ${error.message}` })
      })
      child.on('close', (code) => {
        clearTimeout(timeout)
        const parsed = parsePing(output, code, isWindows)
        const localError = !isWindows && code === 2 || /permission|permiss[aã]o|access denied|acesso negado|general failure|falha geral|not permitted|invalid option/i.test(output + errorOutput)
        finish({ ...parsed, checkedAt, probeError: localError || parsed.probeError,
          error: localError ? `Falha no coletor: ${errorOutput.trim() || output.trim()}` : parsed.error })
      })
    })
  }
}
