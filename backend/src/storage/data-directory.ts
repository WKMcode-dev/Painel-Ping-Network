import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import '../config/env.js'

/** Data belongs to the OS user, never to a downloaded application version. */
export function resolveDataDirectory(platform = process.platform, variables: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  if (variables.DATA_DIR) {
    if (!isAbsolute(variables.DATA_DIR)) throw new Error('DATA_DIR deve ser um caminho absoluto para permanecer independente da pasta da versão.')
    return variables.DATA_DIR
  }
  if (platform === 'win32') return join(variables.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'PainelPing', 'data')
  return join(variables.XDG_DATA_HOME || join(home, '.local', 'share'), 'painel-ping', 'data')
}
// Importing env first ensures DATA_DIR in .env is loaded before paths are resolved.
export const dataDirectory = resolveDataDirectory()
export const dataFile = (name: string) => join(dataDirectory, name)
