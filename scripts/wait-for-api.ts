import { setTimeout as delay } from 'node:timers/promises'

/** A successful health response means storage, migration and monitoring initialized. */
export async function waitForApi(
  url: string,
  {
    timeoutMs = 60000,
    retryMs = 250,
    requestMs = 1000,
    signal,
  }: {
    timeoutMs?: number
    retryMs?: number
    requestMs?: number
    signal?: AbortSignal
  } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    signal?.throwIfAborted()
    try {
      const response = await fetch(url, {
        signal: signal
          ? AbortSignal.any([
              signal,
              AbortSignal.timeout(Math.max(1, Math.min(requestMs, deadline - Date.now()))),
            ])
          : AbortSignal.timeout(Math.max(1, Math.min(requestMs, deadline - Date.now()))),
      })
      if (response.ok) {
        const health = (await response.json()) as { status?: string; application?: string }
        if (health.status === 'ok' && health.application === 'painel-ping') return
      }
    } catch {
      signal?.throwIfAborted()
    }
    const remaining = deadline - Date.now()
    if (remaining > 0) await delay(Math.min(retryMs, remaining), undefined, { signal })
  }
  throw new Error(
    `A API não ficou pronta em ${Math.ceil(timeoutMs / 1000)}s (${url}). Confira os erros do BACKEND, a migração e a porta configurada. O frontend não foi iniciado.`,
  )
}
