import type { PingResult } from '../types/monitor.js'

/** Windows can exit with 0 for destination-unreachable; require a timed reply. */
export function parsePing(output: string, code: number | null, windows: boolean): Omit<PingResult, 'checkedAt'> {
  const latency = output.match(/(?:time|tempo)\s*([=<])\s*([\d.,]+)\s*ms/i)
  const ttl = output.match(/(?:ttl|hlim)[=:]\s*(\d+)/i)
  const alive = code === 0 && (!windows || Boolean(latency))
  return {
    alive,
    latencyMs: alive && latency?.[2] ? (latency[1] === '<' ? 0 : Number(latency[2].replace(',', '.'))) : null,
    ttl: alive && ttl?.[1] ? Number(ttl[1]) : null,
    error: alive ? undefined : 'Host não respondeu ao ICMP',
  }
}
