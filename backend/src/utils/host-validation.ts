import { isIP } from 'node:net'

const hostnamePattern = /^(?=.{1,253}$)(?!-)[a-z\d-]{1,63}(?<!-)(?:\.(?!-)[a-z\d-]{1,63}(?<!-))*$/i

export function isValidHost(value: string): boolean {
  return isIP(value) !== 0 || hostnamePattern.test(value)
}
