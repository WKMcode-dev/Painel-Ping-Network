import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { env } from '../config/env.js'
import type { StatusEvent } from '../types/monitor.js'

const eventSchema = z.object({
  id: z.string(), hostId: z.string(), type: z.enum(['down', 'recovery', 'interrupted']),
  timestamp: z.string().datetime(), durationMs: z.number().nonnegative().nullable(), message: z.string(),
})
const currentDirectory = dirname(fileURLToPath(import.meta.url))
const storagePath = resolve(currentDirectory, '../../storage/status-history.json')

export class HistoryRepository {
  constructor(private readonly filePath = storagePath) {}

  private events: StatusEvent[] = []
  private writeQueue = Promise.resolve()

  async initialize(): Promise<void> {
    try {
      this.events = z.array(eventSchema).parse(JSON.parse(await readFile(this.filePath, 'utf8')))
      this.events.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
      this.prune()
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      this.events = []
    }
  }

  async flush(): Promise<void> { await this.writeQueue }

  getAll(): StatusEvent[] {
    this.prune()
    return [...this.events]
  }

  getByHost(hostId: string): StatusEvent[] {
    this.prune()
    return this.events.filter((event) => event.hostId === hostId)
  }

  add(event: StatusEvent): void {
    this.events.unshift(event)
    this.prune()
    this.writeQueue = this.writeQueue.then(() => this.persist()).catch(console.error)
  }

  private prune(): void {
    const cutoff = Date.now() - env.DATA_RETENTION_DAYS * 24 * 60 * 60 * 1000
    this.events = this.events.filter((event) => Date.parse(event.timestamp) >= cutoff).slice(0, 5000)
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    const temporaryPath = `${this.filePath}.tmp`
    await writeFile(temporaryPath, JSON.stringify(this.events, null, 2), 'utf8')
    await rename(temporaryPath, this.filePath)
  }
}
