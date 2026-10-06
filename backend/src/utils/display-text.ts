import { isIP } from 'node:net'
/** Text fields aren't alternate address fields. IPv6 scope IDs are considered addresses too. */
export function containsIp(text: string): boolean {
  const ipv4 = text.match(/(?:\d{1,3}\.){3}\d{1,3}/g) ?? []
  const ipv6 = text.match(/[\da-f]*:[\da-f:%._-]+/gi) ?? []
  return [...ipv4, ...ipv6].some((value) => isIP(value.split('%')[0]!.replace(/[.,]+$/, '')) !== 0)
}
export const safeDisplayText = (text: string) =>
  !containsIp(text) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)
