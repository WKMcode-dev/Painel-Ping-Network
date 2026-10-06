import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'
import { dataFile } from '../storage/data-directory.js'
import { env } from '../config/env.js'
import type { IncidentReport } from '../types/snmp.js'
const schema = z.object({
  id: z.string(),
  hostId: z.string(),
  deviceName: z.string().optional(),
  protocol: z.enum(['icmp', 'tcp', 'http', 'snmp']),
  subject: z.string(),
  state: z.enum(['active', 'resolved', 'interrupted']),
  firstObservedAt: z.string().datetime(),
  confirmedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  observedFailure: z.string(),
  cause: z.string(),
  certainty: z.enum(['verified', 'unidentified']),
  evidence: z.array(
    z.object({
      source: z.enum(['icmp', 'tcp', 'http', 'snmp']),
      message: z.string(),
      checkedAt: z.string().datetime(),
    }),
  ),
})
/** Histórico próprio: um incidente mantém identidade e evidências mesmo após reiniciar. */
export class IncidentRepository {
  private reports: IncidentReport[] = []
  private queue = Promise.resolve()
  constructor(private readonly path = dataFile('incident-reports.json')) {}
  async initialize() {
    try {
      this.reports = z.array(schema).parse(JSON.parse(await readFile(this.path, 'utf8')))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const now = new Date().toISOString()
    for (const report of this.reports)
      if (report.state === 'active') {
        report.state = 'interrupted'
        report.endedAt = now
      }
    if (this.reports.length) this.schedule()
  }
  getAll() {
    return structuredClone(this.reports).sort((a, b) => b.confirmedAt.localeCompare(a.confirmedAt))
  }
  upsert(report: IncidentReport) {
    this.reports = [
      structuredClone(report),
      ...this.reports.filter((item) => item.id !== report.id),
    ]
      .filter(
        (item) =>
          item.state === 'active' ||
          Date.parse(item.confirmedAt) >= Date.now() - env.DATA_RETENTION_DAYS * 86400000,
      )
      .slice(0, 5000)
    this.schedule()
  }
  private schedule() {
    const content = JSON.stringify(this.reports, null, 2)
    this.queue = this.queue
      .catch(() => {})
      .then(async () => {
        await mkdir(dirname(this.path), { recursive: true })
        await writeFile(this.path + '.tmp', content)
        await rename(this.path + '.tmp', this.path)
      })
    void this.queue.catch((error) =>
      console.error('Falha ao persistir incidentes:', error.code ?? 'IO'),
    )
  }
  async flush() {
    await this.queue
  }
}
