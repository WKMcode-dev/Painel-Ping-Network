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
import { checkService } from './service-check.service.js'
import { PingService } from './ping.service.js'

type Listener = (snapshot: DashboardSnapshot) => void

export class MonitorService {
  constructor(
    private readonly pingService: Pick<PingService, 'probe'> = new PingService(),
    private readonly historyRepository: Pick<HistoryRepository, 'initialize' | 'getByHost' | 'getAll' | 'add' | 'flush'> = new HistoryRepository(),
    private readonly definitions: HostDefinition[] = monitoredHosts.map(h => ({ ...h })),
    private readonly now: () => number = Date.now,
  ) {}
  private configRepository?: ConfigRepository
  private configuration: MonitorConfig | null = null
  private mutations: Promise<unknown> = Promise.resolve()
  private readonly failureBounds = new Map<string, string | null>()
  private readonly firstFailures = new Map<string, string>()
  private readonly accounting = new Map<string, { at: number; status: 'online' | 'offline' | 'unknown'; category: 'normal' | 'paused' | 'maintenance' }>()
  private readonly generations = new Map<string, number>()
  private readonly gapHosts = new Set<string>()
  private lastCycleAt: number | null = null
  private staleLimit() {
    const slots = Math.ceil(this.hosts.size / env.MAX_CONCURRENT_PINGS)
    return Math.max(30000, env.PING_INTERVAL_MS * 3, slots * (env.PING_TIMEOUT_MS * 3 + 750) * 2 + env.PING_INTERVAL_MS)
  }
  /** Only observed normal time enters availability; scheduled/excluded time is counted separately. */
  private timeTotals(host: HostSnapshot, now: number) {
    const totals = { onlineObservedMs: host.onlineObservedMs ?? 0, offlineObservedMs: host.offlineObservedMs ?? 0,
      unknownMs: host.unknownMs ?? 0, pausedMs: host.pausedMs ?? 0, maintenanceMs: host.maintenanceMs ?? 0 }
    const account = this.accounting.get(host.id)
    if (!account || now <= account.at) return { ...totals, observedMs: totals.onlineObservedMs + totals.offlineObservedMs }
    const start = host.maintenanceStart ? Date.parse(host.maintenanceStart) : NaN
    const end = host.maintenanceEnd ? Date.parse(host.maintenanceEnd) : NaN
    const boundaries = [account.at, ...[start, end].filter(t => t > account.at && t < now), now].sort((a, b) => a - b)
    for (let i = 1; i < boundaries.length; i++) {
      const from = boundaries[i - 1]!, to = boundaries[i]!, midpoint = (from + to) / 2
      const key = account.category === 'paused' ? 'pausedMs'
        : midpoint >= start && midpoint < end ? 'maintenanceMs'
        : account.category === 'maintenance' || now - account.at > this.staleLimit() || account.status === 'unknown' ? 'unknownMs'
        : account.status === 'online' ? 'onlineObservedMs' : 'offlineObservedMs'
      totals[key] += to - from
    }
    return { ...totals, observedMs: totals.onlineObservedMs + totals.offlineObservedMs }
  }
  private advance(host: HostSnapshot, now: number) {
    Object.assign(host, this.timeTotals(host, now))
    const suspended = this.suspension(host)
    this.accounting.set(host.id, { at: now, status: host.status, category: suspended ? host.enabled === false ? 'paused' : 'maintenance' : 'normal' })
  }
  private markGap(host: HostSnapshot, message: string, now: number) {
    if (this.gapHosts.has(host.id)) return
    this.advance(host, now)
    this.interrupt(host, message, true)
    host.status = 'unknown'; host.latencyMs = null; host.consecutiveFailures = 0
    this.successes.delete(host.id); this.firstFailures.delete(host.id); this.failureBounds.delete(host.id); this.gapHosts.add(host.id)
    this.accounting.set(host.id, { at: now, status: 'unknown', category: 'normal' })
    this.historyRepository.add({ id: randomUUID(), hostId: host.id, type: 'gap', timestamp: new Date(now).toISOString(), durationMs: null, message })
  }
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
    for (const host of this.hosts.values()) this.generations.set(host.id, (this.generations.get(host.id) ?? 0) + 1)
    const running = this.cycle
    const operation = this.mutations.then(async () => {
      await running
      if (!this.configRepository || !this.configuration) throw new Error('Configuração indisponível')
      const config = change(this.configuration)
      await this.configRepository.save(config)
      for (const [id, host] of this.hosts) {
        const next = config.hosts.find(h => h.id === id)
        if (!next || next.address !== host.address || JSON.stringify(next.checks) !== JSON.stringify(host.checks)) {
          this.interrupt(host, 'Cadastro removido ou endereço alterado')
          this.hosts.delete(id); this.accounting.delete(id); this.gapHosts.delete(id)
        }
      }
      this.configuration = config
      this.definitions.splice(0, this.definitions.length, ...config.hosts)
      this.seedHosts()
      for (const definition of config.hosts) {
        const host = this.hosts.get(definition.id)!
        this.advance(host, this.now())
        Object.assign(host, { checks: undefined, description: undefined, enabled: true, maintenanceStart: null, maintenanceEnd: null }, definition)
        host.consecutiveFailures = 0
        this.successes.delete(host.id); this.firstFailures.delete(host.id); this.failureBounds.delete(host.id)
        if (this.suspension(host)) { this.interrupt(host, this.suspension(host)!); host.status = 'unknown'; host.latencyMs = null }
        this.advance(host, this.now())
      }
      this.listeners.forEach(listener => listener(this.getSnapshot()))
      return config
    })
    this.mutations = operation.catch(() => {})
    return operation
  }
  private interrupt(host: HostSnapshot, message: string, unknownDuration = false) {
    const since = this.openIncidents.get(host.id)
    if (since) this.historyRepository.add({ id: randomUUID(), hostId: host.id, type: 'interrupted',
      timestamp: new Date(this.now()).toISOString(), durationMs: unknownDuration ? null : Math.max(0, this.now() - Date.parse(since)), message })
    this.openIncidents.delete(host.id)
  }
  private suspension(host: HostDefinition): string | undefined {
    if (host.enabled === false) return 'Monitoramento pausado'
    const now = this.now()
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
    this.seedHosts(true)
    await this.runCycle()
    this.timer = setInterval(() => {
      const snapshot = this.getSnapshot(); this.listeners.forEach(listener => listener(snapshot))
      void this.runCycle().catch(console.error)
    }, env.PING_INTERVAL_MS)
  }

  private seedHosts(restoring = false) {
    for (const host of this.definitions) {
      if (this.hosts.has(host.id)) continue
      const events = this.historyRepository.getByHost(host.id)
      const latestIncident = events.find(e => ['down', 'recovery', 'interrupted'].includes(e.type))
      if (restoring && latestIncident?.type === 'down') this.historyRepository.add({ id: randomUUID(), hostId: host.id, type: 'interrupted', timestamp: new Date(this.now()).toISOString(), durationMs: null, message: 'Coletor reiniciado; continuidade do incidente desconhecida' })
      if (restoring && events.length) this.historyRepository.add({ id: randomUUID(), hostId: host.id, type: 'gap', timestamp: new Date(this.now()).toISOString(), durationMs: null, message: 'Nova sessão de coleta; intervalo desde a sessão anterior não observado' })
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
        history: [], dataQuality: 'checking', observedMs: 0, unknownMs: 0, onlineObservedMs: 0, offlineObservedMs: 0, pausedMs: 0, maintenanceMs: 0, serviceChecks: [],
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
    const now = this.now()
    const hosts = [...this.hosts.values()].map(host => {
      const age = host.lastCheckedAt ? Math.max(0, now - Date.parse(host.lastCheckedAt)) : null
      const suspended = this.suspension(host)
      const stale = !suspended && age !== null && age > this.staleLimit()
      if (stale) this.markGap(host, 'Sem atualização: período de disponibilidade desconhecido', now)
      const totals = this.timeTotals(host, now)
      return { ...host, suspended, checkAgeMs: age,
        status: suspended || stale ? 'unknown' as const : host.status,
        dataQuality: suspended ? host.enabled === false ? 'paused' as const : 'maintenance' as const : stale ? 'stale' as const : host.dataQuality,
        ...totals,
        availabilityPct: totals.observedMs ? totals.onlineObservedMs / totals.observedMs * 100 : 0,
        serviceChecks: host.serviceChecks?.map(check => stale || suspended ? { ...check, status: 'unknown' as const } : check),
        currentDowntimeMs: !stale && !suspended && host.status === 'offline' && host.lastOfflineAt ? Math.max(0, now - Date.parse(host.lastOfflineAt)) : 0 }
    })
    const onlineHosts = hosts.filter((host) => host.status === 'online')
    const observedMs = hosts.reduce((sum, host) => sum + (host.observedMs ?? 0), 0)
    const latencies = onlineHosts.flatMap((host) => host.latencyMs ?? [])

    return {
      intervalMs: env.PING_INTERVAL_MS, staleAfterMs: this.staleLimit(),
      generatedAt: new Date(this.now()).toISOString(),
      summary: {
        total: hosts.length,
        online: onlineHosts.length,
        offline: hosts.filter((host) => host.status === 'offline').length,
        unknown: hosts.filter((host) => host.status === 'unknown').length,
        availabilityPct: observedMs ? hosts.reduce((sum, host) => sum + (host.onlineObservedMs ?? 0), 0) / observedMs * 100 : 0,
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
    const now = this.now()
    if (this.lastCycleAt !== null && now - this.lastCycleAt > this.staleLimit()) for (const host of this.hosts.values()) if (!this.suspension(host)) this.markGap(host, 'Coleta interrompida ou computador suspenso', now)
    this.lastCycleAt = now
    const queue = [...this.hosts.values()]
    await Promise.all(Array.from({ length: Math.min(queue.length, env.MAX_CONCURRENT_PINGS) }, async () => {
      for (let host = queue.shift(); host; host = queue.shift()) {
        const generation = this.generations.get(host.id) ?? 0
        const suspended = this.suspension(host)
        if (suspended) {
          const category = host.enabled === false ? 'paused' : 'maintenance'
          this.advance(host, this.now())
          if (host.dataQuality !== category) this.historyRepository.add({ id: randomUUID(), hostId: host.id, type: category, timestamp: new Date(this.now()).toISOString(), durationMs: null, message: suspended })
          host.dataQuality = category
          this.interrupt(host, suspended)
          host.status = 'unknown'; host.consecutiveFailures = 0; host.latencyMs = null
          this.successes.delete(host.id); this.advance(host, this.now())
          continue
        }
        try {
          let timeout: ReturnType<typeof setTimeout> | undefined
          const started = this.now()
          const result = await Promise.race([this.pingService.probe(host.address), new Promise<PingResult>(resolve => {
            timeout = setTimeout(() => resolve({ alive: false, latencyMs: null, ttl: null, checkedAt: new Date(this.now()).toISOString(), probeError: true, error: 'Coletor travado: verificação indisponível' }), env.PING_TIMEOUT_MS * 2 + 1500)
          })]).finally(() => clearTimeout(timeout))
          if (generation !== (this.generations.get(host.id) ?? 0) || this.hosts.get(host.id) !== host || this.now() - started > this.staleLimit()) continue
          if (!this.applyResult(host, result)) continue
          const checks = await Promise.all((host.checks ?? []).map(check => check.type === 'tcp' && !result.resolvedAddress && result.probeError
            ? Promise.resolve({ id: check.id, type: check.type, status: 'unknown' as const, checkedAt: new Date(this.now()).toISOString(), latencyMs: null, error: 'Resolução indisponível' })
            : checkService(result.resolvedAddress ?? host.address, check)))
          if (generation === (this.generations.get(host.id) ?? 0) && !this.suspension(host)) host.serviceChecks = checks
        }
        catch (error) {
          if (generation !== (this.generations.get(host.id) ?? 0)) continue
          this.applyResult(host, { alive: false, latencyMs: null, ttl: null,
            checkedAt: new Date(this.now()).toISOString(), probeError: true, error: String(error) })
        }
      }
    }))
    const snapshot = this.getSnapshot()
    this.listeners.forEach((listener) => listener(snapshot))
  }

  private applyResult(host: HostSnapshot, result: PingResult): boolean {
    if (this.suspension(host)) {
      this.interrupt(host, this.suspension(host)!)
      host.status = 'unknown'; host.consecutiveFailures = 0; this.successes.delete(host.id)
      return false
    }
    const parsedTime = Date.parse(result.checkedAt)
    if (!Number.isFinite(parsedTime) || parsedTime > this.now() + 1000 || host.lastCheckedAt && parsedTime < Date.parse(host.lastCheckedAt)) return false
    this.advance(host, this.now())
    if (result.resolvedAddress && host.resolvedAddress && result.resolvedAddress !== host.resolvedAddress) {
      this.interrupt(host, 'IP resolvido alterado', true)
      this.historyRepository.add({ id: randomUUID(), hostId: host.id, type: 'dns_change', timestamp: result.checkedAt, durationMs: null, message: `DNS: ${host.resolvedAddress} → ${result.resolvedAddress}` })
      host.history = []; host.status = 'unknown'; host.consecutiveFailures = 0; this.successes.delete(host.id); this.firstFailures.delete(host.id); this.failureBounds.delete(host.id)
    }
    if (result.resolvedAddress) host.resolvedAddress = result.resolvedAddress
    const previousCheck = host.lastCheckedAt
    const previousStatus = host.status
    host.lastCheckedAt = result.checkedAt
    host.lastError = result.error ?? null
    host.ttl = result.ttl
    host.latencyMs = result.latencyMs
    if (result.probeError) {
      this.interrupt(host, 'Verificação indisponível; continuidade desconhecida', true)
      host.dataQuality = 'collector-error'; host.latencyMs = null; host.ttl = null
      this.firstFailures.delete(host.id); this.failureBounds.delete(host.id)
      host.status = 'unknown'
      host.consecutiveFailures = 0
      this.successes.delete(host.id)
      this.advance(host, this.now())
      return true // A collector failure is not a lost network packet.
    }
    host.dataQuality = 'fresh'; this.gapHosts.delete(host.id)
    if (!result.alive && !host.consecutiveFailures) { this.firstFailures.set(host.id, result.checkedAt); this.failureBounds.set(host.id, host.history.at(-1)?.online ? previousCheck : null) }
    if (result.alive) { this.firstFailures.delete(host.id); this.failureBounds.delete(host.id) }
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
      host.firstFailureAt = this.firstFailures.get(host.id) ?? result.checkedAt
      host.downConfirmedAt = result.checkedAt
      host.lastTransitionAt = result.checkedAt
      this.historyRepository.add({ id: randomUUID(), hostId: host.id, type: 'down',
        timestamp: result.checkedAt, firstFailureAt: host.firstFailureAt ?? result.checkedAt, confirmedAt: result.checkedAt, previousCheckAt: this.failureBounds.get(host.id) ?? null, durationMs: null, message: `${host.name} parou de responder` })
    } else if (host.status === 'online' && openSince) {
      this.openIncidents.delete(host.id)
      host.lastTransitionAt = result.checkedAt
      this.historyRepository.add({ id: randomUUID(), hostId: host.id, type: 'recovery',
        timestamp: result.checkedAt, durationMs: Math.max(0, Date.parse(result.checkedAt) - Date.parse(openSince)),
        message: `${host.name} voltou a responder` })
    } else if (host.status === 'online' && previousStatus === 'unknown') {
      host.lastTransitionAt = result.checkedAt
    }
    this.advance(host, this.now())
    return true
  }

  private updateMetrics(host: HostSnapshot): void {
    const successful = host.history.filter((point) => point.online)
    const latencies = successful.flatMap((point) => point.latencyMs ?? [])
    const total = host.history.length

    host.packetLossPct = total ? ((total - successful.length) / total) * 100 : 0
    host.responsePct = total ? (successful.length / total) * 100 : 0
    host.sampleCount = total; host.sampleWindowStart = host.history[0]?.timestamp ?? null; host.sampleWindowEnd = host.history.at(-1)?.timestamp ?? null
    const sorted = [...latencies].sort((a, b) => a - b)
    host.p95LatencyMs = sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * .95) - 1)]! : null
    host.jitterMs = latencies.length > 1 ? latencies.slice(1).reduce((sum, value, i) => sum + Math.abs(value - latencies[i]!), 0) / (latencies.length - 1) : null
    host.averageLatencyMs = latencies.length
      ? latencies.reduce((sum, latency) => sum + latency, 0) / latencies.length
      : null
    host.minLatencyMs = latencies.length ? Math.min(...latencies) : null
    host.maxLatencyMs = latencies.length ? Math.max(...latencies) : null
  }
}
