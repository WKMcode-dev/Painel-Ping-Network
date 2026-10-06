import { IncidentTracker } from '../domain/monitoring/incident-tracker.js'
import { ObservationAccounting } from '../domain/monitoring/observation-accounting.js'
import { HostResultProcessor } from '../domain/monitoring/host-result-processor.js'
import type { ConfigRepository, MonitorConfig } from '../repositories/config.repository.js'
import { randomUUID } from 'node:crypto'
import { env } from '../config/env.js'
import { monitoredHosts } from '../config/hosts.js'
import { HistoryRepository } from '../repositories/history.repository.js'
import type {
  DashboardSnapshot,
  HostSnapshot,
  HostDefinition,
  PingResult,
  StatusEvent,
} from '../types/monitor.js'
import { canonicalHost } from '../security/service-target.js'
import { checkService } from './service-check.service.js'
import { PingService } from './ping.service.js'

type Listener = (snapshot: DashboardSnapshot) => void

/** Orquestra coleta e publicação. Domínio calcula indicadores; repositórios persistem dados.
 * Mutações são serializadas e gerações invalidam respostas de cadastros antigos. */
export class MonitorService {
  constructor(
    private readonly pingService: Pick<PingService, 'probe'> = new PingService(),
    private readonly historyRepository: Pick<
      HistoryRepository,
      'initialize' | 'getByHost' | 'getAll' | 'add' | 'flush'
    > = new HistoryRepository(),
    private readonly definitions: HostDefinition[] = monitoredHosts.map((h) => ({ ...h })),
    private readonly now: () => number = Date.now,
  ) {
    this.incidents = new IncidentTracker(this.historyRepository, this.now)
    this.results = new HostResultProcessor({
      now: this.now,
      suspension: (host) => this.suspension(host),
      accounting: this.accounting,
      incidents: this.incidents,
      recordEvent: (event) => this.historyRepository.add(event),
      clearGap: (id) => {
        this.gapHosts.delete(id)
      },
      policy: () => ({
        recoveryThreshold: this.configuration?.recoveryThreshold ?? 1,
        failureThreshold: this.configuration?.failureThreshold ?? env.FAILURE_THRESHOLD,
        historyLimit: env.HISTORY_LIMIT,
      }),
    })
  }
  private configRepository?: ConfigRepository
  private configuration: MonitorConfig | null = null
  private mutations: Promise<unknown> = Promise.resolve()
  private readonly accounting = new ObservationAccounting(
    () => this.staleLimit(),
    (host) => this.suspension(host),
  )
  private readonly generations = new Map<string, number>()
  private readonly gapHosts = new Set<string>()
  private lastCycleAt: number | null = null
  private staleLimit() {
    const slots = Math.ceil(this.hosts.size / env.MAX_CONCURRENT_PINGS)
    return Math.max(
      30000,
      env.PING_INTERVAL_MS * 3,
      slots * (env.PING_TIMEOUT_MS * 3 + 750) * 2 + env.PING_INTERVAL_MS,
    )
  }
  private markGap(host: HostSnapshot, message: string, now: number) {
    if (this.gapHosts.has(host.id)) return
    this.accounting.advance(host, now)
    this.incidents.interrupt(host, message, true)
    host.status = 'unknown'
    host.latencyMs = null
    host.consecutiveFailures = 0
    this.results.resetSuccesses(host.id)
    this.incidents.resetFailures(host.id)
    this.gapHosts.add(host.id)
    this.accounting.markUnknown(host.id, now)
    this.historyRepository.add({
      id: randomUUID(),
      hostId: host.id,
      type: 'gap',
      timestamp: new Date(now).toISOString(),
      durationMs: null,
      message,
    })
  }
  private readonly incidents: IncidentTracker
  private readonly results: HostResultProcessor

  async configure(repository: ConfigRepository): Promise<void> {
    this.configRepository = repository
    this.configuration = await repository.load()
    this.definitions.splice(0, this.definitions.length, ...this.configuration.hosts)
  }
  getConfiguration() {
    return this.configuration
  }
  saveConfiguration(config: MonitorConfig): Promise<void> {
    return this.updateConfiguration(() => config).then(() => {})
  }
  /** Invalida sondagens anteriores antes de aguardar o ciclo e serializa mudanças de inventário.
   * Persistência precisa concluir antes de publicar a nova configuração. */
  updateConfiguration(change: (current: MonitorConfig) => MonitorConfig): Promise<MonitorConfig> {
    for (const host of this.hosts.values())
      this.generations.set(host.id, (this.generations.get(host.id) ?? 0) + 1)
    const running = this.cycle
    const operation = this.mutations.then(async () => {
      await running
      if (!this.configRepository || !this.configuration)
        throw new Error('Configuração indisponível')
      const config = change(this.configuration)
      await this.configRepository.save(config)
      for (const [id, host] of this.hosts) {
        const next = config.hosts.find((h) => h.id === id)
        if (
          !next ||
          next.address !== host.address ||
          JSON.stringify(next.checks) !== JSON.stringify(host.checks)
        ) {
          this.incidents.interrupt(host, 'Cadastro removido ou endereço alterado')
          this.hosts.delete(id)
          this.accounting.delete(id)
          this.gapHosts.delete(id)
        }
      }
      this.configuration = config
      this.definitions.splice(0, this.definitions.length, ...config.hosts)
      this.seedHosts()
      for (const definition of config.hosts) {
        const host = this.hosts.get(definition.id)!
        this.accounting.advance(host, this.now())
        Object.assign(
          host,
          {
            checks: undefined,
            description: undefined,
            enabled: true,
            maintenanceStart: null,
            maintenanceEnd: null,
          },
          definition,
        )
        host.consecutiveFailures = 0
        this.results.resetSuccesses(host.id)
        this.incidents.resetFailures(host.id)
        if (this.suspension(host)) {
          this.incidents.interrupt(host, this.suspension(host)!)
          host.status = 'unknown'
          host.latencyMs = null
        }
        this.accounting.advance(host, this.now())
      }
      this.listeners.forEach((listener) => listener(this.getSnapshot()))
      return config
    })
    this.mutations = operation.catch(() => {})
    return operation
  }
  private suspension(host: HostDefinition): string | undefined {
    if (host.enabled === false) return 'Monitoramento pausado'
    const now = this.now()
    if (
      host.maintenanceStart &&
      host.maintenanceEnd &&
      now >= Date.parse(host.maintenanceStart) &&
      now < Date.parse(host.maintenanceEnd)
    )
      return 'Manutenção programada'
    return undefined
  }
  private readonly listeners = new Set<Listener>()
  private readonly hosts = new Map<string, HostSnapshot>()
  private timer: NodeJS.Timeout | null = null
  private cycle: Promise<void> | null = null

  async initialize(): Promise<void> {
    await this.historyRepository.initialize()
    this.seedHosts(true)
    await this.runCycle()
    this.timer = setInterval(() => {
      const snapshot = this.getSnapshot()
      this.listeners.forEach((listener) => listener(snapshot))
      void this.runCycle().catch(console.error)
    }, env.PING_INTERVAL_MS)
  }

  private seedHosts(restoring = false) {
    for (const host of this.definitions) {
      if (this.hosts.has(host.id)) continue
      const events = this.historyRepository.getByHost(host.id)
      const latestIncident = events.find((e) =>
        ['down', 'recovery', 'interrupted'].includes(e.type),
      )
      if (restoring && latestIncident?.type === 'down')
        this.historyRepository.add({
          id: randomUUID(),
          hostId: host.id,
          type: 'interrupted',
          timestamp: new Date(this.now()).toISOString(),
          durationMs: null,
          message: 'Coletor reiniciado; continuidade do incidente desconhecida',
        })
      if (restoring && events.length)
        this.historyRepository.add({
          id: randomUUID(),
          hostId: host.id,
          type: 'gap',
          timestamp: new Date(this.now()).toISOString(),
          durationMs: null,
          message: 'Nova sessão de coleta; intervalo desde a sessão anterior não observado',
        })
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
        dataQuality: 'checking',
        observedMs: 0,
        unknownMs: 0,
        onlineObservedMs: 0,
        offlineObservedMs: 0,
        pausedMs: 0,
        maintenanceMs: 0,
        serviceChecks: [],
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
    const hosts = [...this.hosts.values()].map((host) => {
      const age = host.lastCheckedAt ? Math.max(0, now - Date.parse(host.lastCheckedAt)) : null
      const suspended = this.suspension(host)
      const stale = !suspended && age !== null && age > this.staleLimit()
      if (stale) this.markGap(host, 'Sem atualização: período de disponibilidade desconhecido', now)
      const totals = this.accounting.totals(host, now)
      return {
        ...host,
        suspended,
        checkAgeMs: age,
        status: suspended || stale ? ('unknown' as const) : host.status,
        dataQuality: suspended
          ? host.enabled === false
            ? ('paused' as const)
            : ('maintenance' as const)
          : stale
            ? ('stale' as const)
            : host.dataQuality,
        ...totals,
        availabilityPct: totals.observedMs
          ? (totals.onlineObservedMs / totals.observedMs) * 100
          : 0,
        serviceChecks: host.serviceChecks?.map((check) =>
          stale || suspended ? { ...check, status: 'unknown' as const } : check,
        ),
        currentDowntimeMs:
          !stale && !suspended && host.status === 'offline' && host.lastOfflineAt
            ? Math.max(0, now - Date.parse(host.lastOfflineAt))
            : 0,
      }
    })
    const onlineHosts = hosts.filter((host) => host.status === 'online')
    const observedMs = hosts.reduce((sum, host) => sum + (host.observedMs ?? 0), 0)
    const latencies = onlineHosts.flatMap((host) => host.latencyMs ?? [])

    return {
      intervalMs: env.PING_INTERVAL_MS,
      staleAfterMs: this.staleLimit(),
      generatedAt: new Date(this.now()).toISOString(),
      summary: {
        total: hosts.length,
        online: onlineHosts.length,
        offline: hosts.filter((host) => host.status === 'offline').length,
        unknown: hosts.filter((host) => host.status === 'unknown').length,
        availabilityPct: observedMs
          ? (hosts.reduce((sum, host) => sum + (host.onlineObservedMs ?? 0), 0) / observedMs) * 100
          : 0,
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
    this.cycle ??= this.mutations
      .then(() => this.collect())
      .finally(() => {
        this.cycle = null
      })
    return this.cycle
  }

  private async collect(): Promise<void> {
    const now = this.now()
    if (this.lastCycleAt !== null && now - this.lastCycleAt > this.staleLimit())
      for (const host of this.hosts.values())
        if (!this.suspension(host))
          this.markGap(host, 'Coleta interrompida ou computador suspenso', now)
    this.lastCycleAt = now
    const queue = [...this.hosts.values()]
    await Promise.all(
      Array.from({ length: Math.min(queue.length, env.MAX_CONCURRENT_PINGS) }, async () => {
        for (let host = queue.shift(); host; host = queue.shift()) {
          const generation = this.generations.get(host.id) ?? 0
          const suspended = this.suspension(host)
          if (suspended) {
            const category = host.enabled === false ? 'paused' : 'maintenance'
            this.accounting.advance(host, this.now())
            if (host.dataQuality !== category)
              this.historyRepository.add({
                id: randomUUID(),
                hostId: host.id,
                type: category,
                timestamp: new Date(this.now()).toISOString(),
                durationMs: null,
                message: suspended,
              })
            host.dataQuality = category
            this.incidents.interrupt(host, suspended)
            host.status = 'unknown'
            host.consecutiveFailures = 0
            host.latencyMs = null
            this.results.resetSuccesses(host.id)
            this.accounting.advance(host, this.now())
            continue
          }
          try {
            let timeout: ReturnType<typeof setTimeout> | undefined
            const started = this.now()
            const result = await Promise.race([
              this.pingService.probe(host.address),
              new Promise<PingResult>((resolve) => {
                timeout = setTimeout(
                  () =>
                    resolve({
                      alive: false,
                      latencyMs: null,
                      ttl: null,
                      checkedAt: new Date(this.now()).toISOString(),
                      probeError: true,
                      error: 'Coletor travado: verificação indisponível',
                    }),
                  env.PING_TIMEOUT_MS * 2 + 1500,
                )
              }),
            ]).finally(() => clearTimeout(timeout))
            if (
              generation !== (this.generations.get(host.id) ?? 0) ||
              this.hosts.get(host.id) !== host ||
              this.now() - started > this.staleLimit()
            )
              continue
            if (!this.results.apply(host, result)) continue
            const checks = await Promise.all(
              (host.checks ?? []).map((check) =>
                (!result.resolvedAddress && result.probeError) ||
                (check.type === 'http' &&
                  canonicalHost(new URL(check.url!).hostname) !== canonicalHost(host.address))
                  ? Promise.resolve({
                      id: check.id,
                      type: check.type,
                      status: 'unknown' as const,
                      checkedAt: new Date(this.now()).toISOString(),
                      latencyMs: null,
                      error: 'Resolução indisponível',
                    })
                  : checkService(result.resolvedAddress ?? host.address, check),
              ),
            )
            if (generation === (this.generations.get(host.id) ?? 0) && !this.suspension(host))
              host.serviceChecks = checks
          } catch (error) {
            if (generation !== (this.generations.get(host.id) ?? 0)) continue
            this.results.apply(host, {
              alive: false,
              latencyMs: null,
              ttl: null,
              checkedAt: new Date(this.now()).toISOString(),
              probeError: true,
              error: String(error),
            })
          }
        }
      }),
    )
    const snapshot = this.getSnapshot()
    this.listeners.forEach((listener) => listener(snapshot))
  }
}
