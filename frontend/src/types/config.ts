export interface DeviceConfig {
  id: string; name: string; address: string; group: string; location: string; description?: string
  enabled: boolean; maintenanceStart?: string | null; maintenanceEnd?: string | null
}
export interface MonitorConfig { hosts: DeviceConfig[]; failureThreshold: number; recoveryThreshold: number }
export interface PanelPreferences { hidden: string[]; rotateSeconds: number; alerts: boolean; sound: boolean; mutedUntil: number }
export const defaultPreferences: PanelPreferences = { hidden: [], rotateSeconds: 20, alerts: false, sound: false, mutedUntil: 0 }
