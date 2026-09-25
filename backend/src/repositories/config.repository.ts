import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { monitoredHosts } from '../config/hosts.js'
import { env } from '../config/env.js'
import { isValidHost } from '../utils/host-validation.js'

export const hostSchema = z.object({
  id: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  name: z.string().trim().min(1).max(100), address: z.string().trim().refine(isValidHost, 'IP ou hostname inválido'),
  group: z.string().trim().min(1).max(100), location: z.string().trim().max(100),
  description: z.string().max(500).optional(), enabled: z.boolean().default(true),
  maintenanceStart: z.string().datetime().nullable().optional(), maintenanceEnd: z.string().datetime().nullable().optional(),
}).refine(h => (!h.maintenanceStart && !h.maintenanceEnd) ||
  (h.maintenanceStart && h.maintenanceEnd && Date.parse(h.maintenanceEnd) > Date.parse(h.maintenanceStart)), 'Informe início e fim válidos para a manutenção')
export const configSchema = z.object({
  hosts: z.array(hostSchema).max(200).refine(h => new Set(h.map(x => x.id)).size === h.length, 'IDs duplicados'),
  failureThreshold: z.number().int().min(1).max(20), recoveryThreshold: z.number().int().min(1).max(20),
})
export type MonitorConfig = z.infer<typeof configSchema>
export class ConfigRepository {
  constructor(private readonly path = resolve(dirname(fileURLToPath(import.meta.url)), '../../storage/config.json')) {}
  async load(): Promise<MonitorConfig> {
    try { return configSchema.parse(JSON.parse(await readFile(this.path, 'utf8'))) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      return configSchema.parse({ hosts: monitoredHosts, failureThreshold: env.FAILURE_THRESHOLD, recoveryThreshold: 1 })
    }
  }
  async save(config: MonitorConfig): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    await writeFile(this.path + '.tmp', JSON.stringify(config, null, 2))
    await rename(this.path + '.tmp', this.path)
  }
}
