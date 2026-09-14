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
    private readonly definitions: HostDefinition[] = monitoredHosts,
  ) {}
  private readonly listeners = new Set<Listener>()
  private readonly hosts = new Map<string, HostSnapshot>()
  private timer: NodeJS.Timeout | null = null
  private cycle: Promise<void> | null = null
  private readonly openIncidents = new Map<string, string>()

  async initialize(): Promise<void> {
    await this.historyRepository.initialize()
    for (const host of this.definitions) {
      const events = this.historyRepository.getByHost(host.id)
      if (this.hosts.has(host.id)) throw new Error(`ID duplicado: ${host.id}`)
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
    await this.runCycle()
    this.timer = setInterval(() => void this.runCycle(), env.PING_INTERVAL_MS)
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    await this.cycle
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
    this.cycle ??= this.collect().finally(() => { this.cycle = null })
    return this.cycle
  }

  private async collect(): Promise<void> {
    const queue = [...this.hosts.values()]
    await Promise.all(Array.from({ length: Math.min(queue.length, env.MAX_CONCURRENT_PINGS) }, async () => {
      for (let host = queue.shift(); host; host = queue.shift()) {
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
    const previousStatus = host.status
    host.lastCheckedAt = result.checkedAt
    host.lastError = result.error ?? null
    host.ttl = result.ttl
    host.latencyMs = result.latencyMs
    if (result.probeError) {
      host.status = 'unknown'
      host.consecutiveFailures = 0
      return // A collector failure is not a lost network packet.
    }
    host.consecutiveFailures = result.alive ? 0 : host.consecutiveFailures + 1

    if (result.alive) {
      host.status = 'online'
      host.lastOnlineAt = result.checkedAt
    } else if (host.consecutiveFailures >= env.FAILURE_THRESHOLD) {
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
