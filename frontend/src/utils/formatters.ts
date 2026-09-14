const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

export function formatDateTime(value: string | null): string {
  return value ? dateFormatter.format(new Date(value)) : 'Sem registro'
}

export function formatLatency(value: number | null): string {
  return value === null ? '—' : value === 0 ? '<1 ms' : `${value < 10 ? value.toFixed(1) : Math.round(value)} ms`
}

export function formatPercent(value: number): string {
  return `${value.toFixed(value >= 99 ? 2 : 1)}%`
}

export function formatDuration(milliseconds: number): string {
  if (milliseconds <= 0) return '—'
  const seconds = Math.floor(milliseconds / 1000)
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days) return `${days}d ${hours}h`
  if (hours) return `${hours}h ${minutes}min`
  if (minutes) return `${minutes}min ${seconds % 60}s`
  return `${seconds}s`
}
