import { createInterface } from 'node:readline'
import type { Readable } from 'node:stream'

/** Canal privado do desktop. Comando seguido de EOF deve aguardar um único flush. */
export function attachDesktopShutdown(
  input: Readable,
  stop: () => Promise<void>,
  exit: (code: number) => void,
): void {
  const reader = createInterface({ input })
  let closing = false
  const close = () => {
    if (closing) return
    closing = true
    void stop().then(
      () => exit(0),
      () => exit(1),
    )
  }
  reader.on('line', (line) => {
    if (line === 'shutdown') close()
  })
  // EOF cobre o desaparecimento do pai, inclusive sem comando explícito.
  reader.on('close', close)
}
