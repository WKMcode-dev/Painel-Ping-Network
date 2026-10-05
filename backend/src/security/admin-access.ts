import { allowedOrigin } from './origin.js'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { RequestHandler } from 'express'
import { dataFile } from '../storage/data-directory.js'

/** Stored outside releases. Never expose this key through configuration or status APIs. */
export async function loadAdminKey(path = dataFile('admin-access.json'), onCreated?: (key: string) => void): Promise<string> {
  if (process.env.ADMIN_TOKEN) {
    if (process.env.ADMIN_TOKEN.length < 32 || process.env.ADMIN_TOKEN.length > 512 || /[^\x21-\x7e]/.test(process.env.ADMIN_TOKEN)) throw new Error('ADMIN_TOKEN precisa de pelo menos 32 caracteres')
    return process.env.ADMIN_TOKEN
  }
  try {
    const key = JSON.parse(await readFile(path, 'utf8')).key
    if (typeof key !== 'string' || key.length < 32 || key.length > 512 || /[^\x21-\x7e]/.test(key)) throw new Error('Arquivo de acesso administrativo inválido')
    return key
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    const key = randomBytes(32).toString('hex')
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, JSON.stringify({ key }), { flag: 'wx', mode: 0o600 })
    onCreated?.(key)
    return key
  }
}
export const secureEqual = (provided: string, expected: string) => {
  const a = Buffer.from(provided), b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
export function protectWrites(key: string): RequestHandler {
  const attempts = new Map<string, { at: number; count: number; reads: number }>()
  return (req, res, next) => {
    const now = Date.now(), ip = req.socket.remoteAddress ?? 'unknown'
    for (const [id, entry] of attempts) if (now - entry.at > 60000) attempts.delete(id)
    const reading = ['GET', 'HEAD', 'OPTIONS'].includes(req.method)
    const token = req.get('authorization')?.replace(/^Bearer /, '') ?? ''
    const authenticated = Boolean(key) && secureEqual(token, key)
    const bucket = `${ip}:${authenticated ? 'admin' : 'public'}`
    const entry = attempts.get(bucket) ?? { at: now, count: 0, reads: 0 }
    if (reading) entry.reads++; else entry.count++
    attempts.set(bucket, entry)
    if ((reading ? entry.reads > 600 : entry.count > 120) || attempts.size > 2048) { res.set('Retry-After', '60').status(429).json({ message: 'Muitas operações; aguarde um minuto' }); return }
    if (reading) { next(); return }
    const origin = req.get('origin')
    if (!allowedOrigin(origin, req.get('host'))) { res.status(403).json({ message: 'Origem não autorizada' }); return }
    if (!authenticated) { res.status(401).json({ message: 'Chave de administrador necessária para alterar ou atualizar a aplicação' }); return }
    next()
  }
}
