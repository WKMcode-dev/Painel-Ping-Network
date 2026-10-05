/** Mask legacy labels as well as explicit addresses; hiding text isn't API access control. */
export function privateLabel(text: string, address?: string): string {
  let result = address ? text.split(address).join('[endereço oculto]') : text
  result = result.replace(/(?:\d{1,3}\.){3}\d{1,3}/g, '[endereço oculto]')
  return result.replace(/(?:[\da-f]{0,4}:){2,}[\da-f:.%_-]*/gi, '[endereço oculto]')
}
