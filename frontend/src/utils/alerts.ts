import type { DashboardSnapshot, StatusEvent } from '../types/monitor'
import type { PanelPreferences } from '../types/config'

/** Baseline existing events at startup; consume silent/hidden events so they never replay. */
export class AlertTracker {
  private seen: Set<string> | null = null
  accept(snapshot: DashboardSnapshot, preferences: PanelPreferences, now: number): StatusEvent[] {
    const ids = new Set(snapshot.recentEvents.map(e => e.id))
    if (!this.seen) { this.seen = ids; return [] }
    const fresh = snapshot.recentEvents.filter(e => !this.seen!.has(e.id) && e.type !== 'interrupted'
      && !preferences.hidden.includes(e.hostId) && snapshot.hosts.some(h => h.id === e.hostId && !h.suspended)
      && now - Date.parse(e.timestamp) >= 0 && now - Date.parse(e.timestamp) < 60000)
    this.seen = ids
    return preferences.alerts && now >= preferences.mutedUntil ? fresh : []
  }
}
