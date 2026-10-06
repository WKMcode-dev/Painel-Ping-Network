import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { dirname } from 'node:path'
import { dataFile } from '../storage/data-directory.js'
import { monitoredHosts } from '../config/hosts.js'
import { env } from '../config/env.js'

import { configSchema, storedConfigSchema } from '../validation/config.schema.js'
import type { MonitorConfig } from '../validation/config.schema.js'
// Compatibilidade para integrações existentes; novas regras pertencem a validation.
export {
  configSchema,
  storedConfigSchema,
  hostSchema,
  storedHostSchema,
} from '../validation/config.schema.js'
export type { MonitorConfig } from '../validation/config.schema.js'

/** Inventário e regras em JSON. Arquivo inválido interrompe a carga; só ENOENT cria exemplos.
 * O serviço serializa gravações; o rename evita expor um documento parcialmente escrito. */
export class ConfigRepository {
  constructor(private readonly path = dataFile('config.json')) {}
  async load(): Promise<MonitorConfig> {
    try {
      return storedConfigSchema.parse(JSON.parse(await readFile(this.path, 'utf8')))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const initial = configSchema.parse({
        hosts: monitoredHosts,
        failureThreshold: env.FAILURE_THRESHOLD,
        recoveryThreshold: 1,
      })
      await this.save(initial)
      return initial
    }
  }
  async save(config: MonitorConfig): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    await writeFile(this.path + '.tmp', JSON.stringify(config, null, 2))
    await rename(this.path + '.tmp', this.path)
  }
}
