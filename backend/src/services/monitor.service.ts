import type { ConfigRepository, MonitorConfig } from '../repositories/config.repository.js'
import { randomUUID } from 'node:crypto'
import { env } from '../config/env.js'
import { monitoredHosts } from '../config/hosts.js'
import { HistoryRepository } from '../repositories/history.repository.js'
import type {
  DashboardSnapshot,
  HistoryPoint,
  HostSnapshot,
  HostDefinition,
  PingResult,
  StatusEvent,
} from '../types/monitor.js'
import { PingService } from './ping.service.js'

type Listener = (snapshot: DashboardSnapshot) => void

export class MonitorService {
  constructor(
    private readonly pingService: Pick<PingService, 'probe'> = new PingService(),
    private readonly historyRepository: Pick<HistoryRepository, 'initialize' | 'getByHost' | 'getAll' | 'add' | 'flush'> = new HistoryRepository(),
    private readonly definitions: HostDefinition[] = monitoredHosts.map(h => ({ ...h })),
  ) {}
  private configRepository?: ConfigRepository
  private configuration: MonitorConfig | null = null
  private mutations: Promise<unknown> = Promise.resolve()
  private readonly successes = new Map<string, number>()

  async configure(repository: ConfigRepository): Promise<void> {
    this.configRepository = repository
    this.configuration = await repository.load()
    this.definitions.splice(0, this.definitions.length, ...this.configuration.hosts)
  }
  getConfiguration() { return this.configuration }
  saveConfiguration(config: MonitorConfig): Promise<void> {
    return this.updateConfiguration(() => config).then(() => {})
  }
  updateConfiguration(change: (current: MonitorConfig) => MonitorConfig): Promise<MonitorConfig> {
    const running = this.cycle
    const operation = this.mutations.then(async () => {
      await running
      if (!this.configRepository || !this.configuration) throw new Error('Configuração indisponível')
      const config = change(this.configuration)
      await this.configRepository.save(config)
      for (const [id, host] of this.hosts) {
        const next = config.hosts.find(h => h.id === id)
        if (!next || next.address !== host.address) {
          this.interrupt(host, 'Cadastro removido ou endereço alterado')
          this.hosts.delete(id)
        }
      }
      this.configuration = config
      this.definitions.splice(0, this.definitions.length, ...config.hosts)
      this.seedHosts()
      for (const definition of config.hosts) {
        const host = this.hosts.get(definition.id)!
        Object.assign(host, { description: undefined, enabled: true, maintenanceStart: null, maintenanceEnd: null }, definition)
        host.consecutiveFailures = 0
        this.successes.delete(host.id)
        if (this.suspension(host)) { this.interrupt(host, this.suspension(host)!); host.status = 'unknown'; host.latencyMs = null }
      }
      this.listeners.forEach(listener => listener(this.getSnapshot()))
      return config
    })
    this.mutations = operation.catch(() => {})
    return operation
  }
  private interrupt(host: HostSnapshot, message: string) {
    const since = this.openIncidents.get(host.id)
    if (since) this.historyRepository.add({ id: randomUUID(), hostId: host.id, type: 'interrupted',
      timestamp: new Date().toISOString(), durationMs: Math.max(0, Date.now() - Date.parse(since)), message })
    this.openIncidents.delete(host.id)
  }
  private suspension(host: HostDefinition): string | undefined {
    if (host.enabled === false) return 'Monitoramento pausado'
    const now = Date.now()
    if (host.maintenanceStart && host.maintenanceEnd && now >= Date.parse(host.maintenanceStart) && now < Date.parse(host.maintenanceEnd)) return 'Manutenção programada'
    return undefined
  }
  private readonly listeners = new Set<Listener>()
  private readonly hosts = new Map<string, HostSnapshot>()
  private timer: NodeJS.Timeout | null = null
  private cycle: Promise<void> | null = null
  private readonly openIncidents = new Map<string, string>()

  async initialize(): Promise<void> {
    await this.historyRepository.initialize()
    this.seedHosts()
    await this.runCycle()
    this.timer = setInterval(() => void this.runCycle(), env.PING_INTERVAL_MS)
  }

  private seedHosts() {
    for (const host of this.definitions) {
      if (this.hosts.has(host.id)) continue
      const events = this.historyRepository.getByHost(host.id)
      if (events[0]?.type === 'down') this.openIncidents.set(host.id, events[0].timestamp)
      this.hosts.set(host.id, {
        ...host,
        status: 'unknown',
        latencyMs: null,
        averageLatencyMs: null,
        minLatencyMs: null,
        maxLatencyMs: null,
        packetLossPct: 0,
        availabilityPct: 0,
        ttl: null,
        lastCheckedAt: null,
        lastError: null,
        lastOnlineAt: events.find((event) => event.type === 'recovery')?.timestamp ?? null,
        lastOfflineAt: events.find((event) => event.type === 'down')?.timestamp ?? null,
        lastTransitionAt: events[0]?.timestamp ?? null,
        currentDowntimeMs: 0,
        consecutiveFailures: 0,
        history: [],
      })
    }
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    await this.cycle
    await this.mutations
    await this.historyRepository.flush()
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot(): DashboardSnapshot {
    const now = Date.now()
    const hosts = [...this.hosts.values()].map((host) => ({
      ...host,
      suspended: this.suspension(host),
      status: this.suspension(host) ? 'unknown' as const : host.status,
      currentDowntimeMs:
        host.status === 'offline' && host.lastOfflineAt
          ? Math.max(0, now - Date.parse(host.lastOfflineAt))
          : 0,
    }))
    const onlineHosts = hosts.filter((host) => host.status === 'online')
    const knownHosts = hosts.filter((host) => host.status !== 'unknown')
    const latencies = onlineHosts.flatMap((host) => host.latencyMs ?? [])

    return {
      intervalMs: env.PING_INTERVAL_MS,
      generatedAt: new Date().toISOString(),
      summary: {
        total: hosts.length,
        online: onlineHosts.length,
        offline: hosts.filter((host) => host.status === 'offline').length,
        unknown: hosts.filter((host) => host.status === 'unknown').length,
        availabilityPct: knownHosts.length ? (onlineHosts.length / knownHosts.length) * 100 : 0,
        averageLatencyMs: latencies.length
          ? latencies.reduce((sum, latency) => sum + latency, 0) / latencies.length
          : null,
        activeIncidents: hosts.filter((host) => host.status === 'offline').length,
      },
      hosts,
      recentEvents: this.historyRepository.getAll().slice(0, 30),
    }
  }

  getHostEvents(hostId: string): StatusEvent[] {
    return this.historyRepository.getByHost(hostId)
  }

  runCycle(): Promise<void> {
    // Manual requests share an existing cycle instead of returning stale results.
    this.cycle ??= this.mutations.then(() => this.collect()).finally(() => { this.cycle = null })
    return this.cycle
  }

  private async collect(): Promise<void> {
    const queue = [...this.hosts.values()]
    await Promise.all(Array.from({ length: Math.min(queue.length, env.MAX_CONCURRENT_PINGS) }, async () => {
      for (let host = queue.shift(); host; host = queue.shift()) {
        const suspended = this.suspension(host)
        if (suspended) {
          this.interrupt(host, suspended)
          host.status = 'unknown'; host.consecutiveFailures = 0; host.latencyMs = null
          this.successes.delete(host.id)
          continue
        }
        try { this.applyResult(host, await this.pingService.probe(host.address)) }
        catch (error) {
          this.applyResult(host, { alive: false, latencyMs: null, ttl: null,
            checkedAt: new Date().toISOString(), probeError: true, error: String(error) })
        }
      }
    }))
    const snapshot = this.getSnapshot()
    this.listeners.forEach((listener) => listener(snapshot))
  }

  private applyResult(host: HostSnapshot, result: PingResult): void {
    if (this.suspension(host)) {
      this.interrupt(host, this.suspension(host)!)
      host.status = 'unknown'; host.consecutiveFailures = 0; this.successes.delete(host.id)
      return
    }
    const previousStatus = host.status
    host.lastCheckedAt = result.checkedAt
    host.lastError = result.error ?? null
    host.ttl = result.ttl
    host.latencyMs = result.latencyMs
    if (result.probeError) {
      host.status = 'unknown'
      host.consecutiveFailures = 0
      this.successes.delete(host.id)
      return // A collector failure is not a lost network packet.
    }
    host.consecutiveFailures = result.alive ? 0 : host.consecutiveFailures + 1

    const successes = result.alive ? (this.successes.get(host.id) ?? 0) + 1 : 0
    this.successes.set(host.id, successes)
    if (result.alive && successes >= (this.configuration?.recoveryThreshold ?? 1)) {
      host.status = 'online'
      host.lastOnlineAt = result.checkedAt
    } else if (host.consecutiveFailures >= (this.configuration?.failureThreshold ?? env.FAILURE_THRESHOLD)) {
      host.status = 'offline'
    }

    const point: HistoryPoint = {
      timestamp: result.checkedAt,
      online: result.alive,
      latencyMs: result.latencyMs,
    }
    host.history = [...host.history, point].slice(-env.HISTORY_LIMIT)
    this.updateMetrics(host)

    const openSince = this.openIncidents.get(host.id)
    if (host.status === 'offline' && !openSince) {
      this.openIncidents.set(host.id, result.checkedAt)
      host.lastOfflineAt = result.checkedAt
      host.lastTransitionAt = result.checkedAt
      this.historyRepository.add({ id: randomUUID(), hostId: host.id, type: 'down',
        timestamp: result.checkedAt, durationMs: null, message: `${host.name} parou de responder` })
    } else if (host.status === 'online' && openSince) {
      this.openIncidents.delete(host.id)
      host.lastTransitionAt = result.checkedAt
      this.historyRepository.add({ id: randomUUID(), hostId: host.id, type: 'recovery',
        timestamp: result.checkedAt, durationMs: Math.max(0, Date.parse(result.checkedAt) - Date.parse(openSince)),
        message: `${host.name} voltou a responder` })
    } else if (host.status === 'online' && previousStatus === 'unknown') {
      host.lastTransitionAt = result.checkedAt
    }
  }

  private updateMetrics(host: HostSnapshot): void {
    const successful = host.history.filter((point) => point.online)
    const latencies = successful.flatMap((point) => point.latencyMs ?? [])
    const total = host.history.length

    host.packetLossPct = total ? ((total - successful.length) / total) * 100 : 0
    host.availabilityPct = total ? (successful.length / total) * 100 : 0
    host.averageLatencyMs = latencies.length
      ? latencies.reduce((sum, latency) => sum + latency, 0) / latencies.length
      : null
    host.minLatencyMs = latencies.length ? Math.min(...latencies) : null
    host.maxLatencyMs = latencies.length ? Math.max(...latencies) : null
  }
}
