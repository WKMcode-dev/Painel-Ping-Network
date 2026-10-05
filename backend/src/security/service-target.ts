import { isIP } from 'node:net'
export const canonicalHost = (value: string) => {
  const host = value.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  try { return isIP(host) === 6 ? new URL(`http://[${host}]/`).hostname.slice(1, -1) : host } catch { return host }
}
/** LAN targets are intentional; cloud metadata and unspecified destinations aren't services. */
export function safeServiceAddress(value: string): boolean {
  const ip = canonicalHost(value).replace(/^::ffff:/, '')
  return isIP(ip) !== 0 && !/^169\.254\./.test(ip) && ip !== '0.0.0.0' && ip !== '::' && ip !== 'fd00:ec2::254' && !/^fe[89ab][\da-f]:/i.test(ip)
}
