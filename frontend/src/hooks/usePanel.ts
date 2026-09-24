import { useEffect, useRef, useState } from 'react'
import { AlertTracker } from '../utils/alerts'
import { defaultPreferences, type PanelPreferences } from '../types/config'
import type { DashboardSnapshot } from '../types/monitor'

export function usePanel(snapshot: DashboardSnapshot, live: boolean) {
  const [preferences, setPreferences] = useState<PanelPreferences>(() => {
    try {
      const p = JSON.parse(localStorage.getItem('painel-ping:panel') ?? '{}')
      return { hidden: Array.isArray(p.hidden) ? p.hidden.filter((id: unknown) => typeof id === 'string') : [],
        rotateSeconds: Number.isFinite(p.rotateSeconds) ? Math.max(0, Math.min(300, p.rotateSeconds)) : 20,
        alerts: p.alerts === true, sound: p.sound === true, mutedUntil: Number.isFinite(p.mutedUntil) ? p.mutedUntil : 0 }
    } catch { return defaultPreferences }
  })
  useEffect(() => { try { localStorage.setItem('painel-ping:panel', JSON.stringify(preferences)) } catch { /* Session preferences remain usable. */ } }, [preferences])
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  const [alerts, setAlerts] = useState<string[]>([])
  const tracker = useRef(new AlertTracker())
  const audio = useRef<AudioContext | null>(null)
  const [audioReady, setAudioReady] = useState(false)
  const enableAudio = async () => {
    try { audio.current ??= new AudioContext(); await audio.current.resume(); setAudioReady(true) }
    catch { setAudioReady(false) }
  }
  useEffect(() => () => { void audio.current?.close() }, [])
  useEffect(() => {
    if (!live || !snapshot.generatedAt) return
    const fresh = tracker.current.accept(snapshot, preferences, Date.now())
    if (!fresh.length) return
    setAlerts(previous => [...fresh.map(e => e.message), ...previous].slice(0, 5))
    if (preferences.sound && audio.current?.state === 'running') {
      const oscillator = audio.current.createOscillator(), gain = audio.current.createGain()
      gain.gain.value = .08; oscillator.frequency.value = 660
      oscillator.connect(gain); gain.connect(audio.current.destination)
      oscillator.start(); oscillator.stop(audio.current.currentTime + .2)
    }
  }, [snapshot, live, preferences])
  return { preferences, setPreferences, now, alerts, clearAlerts: () => setAlerts([]), enableAudio, audioReady }
}
