import { constants } from 'node:fs'
import { copyFile, mkdir, readFile, readdir, rename, rmdir, rm, stat, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { hostname } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { z } from 'zod'
import { storedConfigSchema } from '../repositories/config.repository.js'
import { topologyDocumentSchema } from '../repositories/topology.repository.js'
import { eventSchema } from '../repositories/history.repository.js'

const files = ['config.json', 'topology.json', 'status-history.json'] as const
const validators = { 'config.json': storedConfigSchema, 'topology.json': topologyDocumentSchema, 'status-history.json': z.array(eventSchema) }
const absent = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT'
async function existingFiles(directory: string) {
  const present: string[] = []
  for (const name of files) {
    try { if (!(await stat(join(directory, name))).isFile()) throw new Error(`${join(directory, name)} não é um arquivo.`); present.push(name) }
    catch (error) { if (!absent(error)) throw error }
  }
  return present
}
async function validate(directory: string, names: string[]) {
  for (const name of names) {
    const parsed = JSON.parse(await readFile(join(directory, name), 'utf8'))
    validators[name as typeof files[number]].parse(parsed)
  }
  if (!names.includes('config.json') && names.includes('topology.json')) {
    const topology = topologyDocumentSchema.parse(JSON.parse(await readFile(join(directory, 'topology.json'), 'utf8')))
    if (topology.graph.nodes.some(n => n.hostId)) throw new Error('O mapa contém dispositivos, mas config.json está ausente. Recupere o cadastro antes de iniciar para preservar os vínculos.')
  }
}
async function fingerprint(directory: string, names: string[]) {
  const hash = createHash('sha256')
  for (const name of names) { hash.update(name); hash.update(await readFile(join(directory, name))) }
  return hash.digest('hex')
}

/** Never mix inventories/maps from different versions or overwrite a fixed dataset. */
export async function initializeStorage({ directory, projectRoot, legacyDirectory, log = console.log }: {
  directory: string; projectRoot: string; legacyDirectory?: string; log?: (message: string) => void
}) {
  const current = await existingFiles(directory)
  if (current.length) {
    await validate(directory, current)
    if (legacyDirectory) log('O armazenamento fixo já contém dados. LEGACY_DATA_DIR foi ignorado para não sobrescrever seu trabalho.')
    log(`Dados persistentes: ${directory}`)
    return { migratedFrom: null }
  }
  // An initialized empty dataset is also authoritative (e.g. all devices intentionally removed).
  try { if (!legacyDirectory) { await stat(join(directory, 'storage-info.json')); log(`Dados persistentes: ${directory}`); return { migratedFrom: null } } }
  catch (error) { if (!absent(error)) throw error }
  const candidates = new Set<string>()
  if (legacyDirectory) {
    if (!isAbsolute(legacyDirectory)) throw new Error('LEGACY_DATA_DIR deve apontar para uma pasta backend/storage usando caminho absoluto.')
    candidates.add(resolve(legacyDirectory))
  } else {
    candidates.add(join(projectRoot, 'backend', 'storage'))
    // Archives are often extracted either directly or inside a version-named container.
    for (const parent of new Set([dirname(projectRoot), dirname(dirname(projectRoot))])) {
      let entries
      try { entries = await readdir(parent, { withFileTypes: true }) }
      catch (error) { if (absent(error)) continue; throw error }
      for (const entry of entries) {
        if (!entry.isDirectory() || !/^Painel[- _]Ping(?:[- _]Network)?(?:[- _]v?\d[\w.-]*)?$/i.test(entry.name)) continue
        const root = join(parent, entry.name)
        candidates.add(join(root, 'backend', 'storage'))
        const nested = await readdir(root, { withFileTypes: true })
        for (const child of nested) if (child.isDirectory() && /^Painel[- _]Ping/i.test(child.name)) candidates.add(join(root, child.name, 'backend', 'storage'))
      }
    }
  }
  const sources: { path: string; names: string[]; fingerprint: string }[] = []
  for (const candidate of candidates) {
    if (resolve(candidate) === resolve(directory)) continue
    const names = await existingFiles(candidate)
    if (names.length) sources.push({ path: candidate, names, fingerprint: await fingerprint(candidate, names) })
  }
  if (legacyDirectory && !sources.length) throw new Error(`Nenhum arquivo de dados encontrado em LEGACY_DATA_DIR: ${legacyDirectory}. A inicialização foi interrompida.`)
  if (new Set(sources.map(s => s.fingerprint)).size > 1) {
    throw new Error(`Foram encontrados conjuntos diferentes de dados. Nenhum foi alterado. Defina LEGACY_DATA_DIR no .env com a pasta backend/storage da versão que deseja recuperar e reinicie:\n${sources.map(s => s.path).join('\n')}`)
  }
  const source = sources[0]
  if (source) await validate(source.path, source.names)
  const staging = `${directory}.migration-${process.pid}`
  await mkdir(dirname(directory), { recursive: true })
  await mkdir(staging, { recursive: false })
  try {
    if (source) {
      const backup = join(staging, 'backups', 'before-migration')
      await mkdir(backup, { recursive: true })
      for (const name of source.names) {
        await copyFile(join(source.path, name), join(staging, name), constants.COPYFILE_EXCL)
        await copyFile(join(staging, name), join(backup, name), constants.COPYFILE_EXCL)
      }
      await validate(staging, source.names)
      if (await fingerprint(staging, source.names) !== source.fingerprint) throw new Error('Os dados antigos mudaram durante a migração. Pare a versão anterior e tente novamente.')
    }
    await writeFile(join(staging, 'storage-info.json'), JSON.stringify({ version: 1, createdAt: new Date().toISOString(), migratedFrom: source?.path ?? null }, null, 2), { flag: 'wx' })
    // A precreated empty destination can be removed, but never any contents.
    try { const contents = await readdir(directory); if (legacyDirectory && contents.length === 1 && contents[0] === 'storage-info.json') await rm(join(directory, 'storage-info.json')); else if (contents.length) throw new Error('A pasta de destino recebeu arquivos durante a migração. Nada foi sobrescrito.'); await rmdir(directory) }
    catch (error) { if (!absent(error)) throw error }
    await rename(staging, directory)
  } finally { await rm(staging, { recursive: true, force: true }) }
  if (source) log(`Dados migrados de ${source.path}. Os arquivos originais foram preservados; uma cópia adicional está em backups/before-migration na pasta fixa.`)
  else log('Nenhum dado de versões anteriores encontrado nas pastas próximas. Se sua versão antiga está em outro local, pare o servidor e configure LEGACY_DATA_DIR antes de cadastrar dispositivos.')
  log(`Dados persistentes: ${directory}`)
  return { migratedFrom: source?.path ?? null }
}

/** Fixed data is shared across releases, so only one backend can own it at a time. */
export async function acquireStorageLock(directory: string): Promise<() => Promise<void>> {
  await mkdir(dirname(directory), { recursive: true })
  const path = join(dirname(directory), `.${basename(directory)}.lock`)
  const content = JSON.stringify({ pid: process.pid, hostname: hostname() })
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await writeFile(path, content, { flag: 'wx' })
      return async () => { if (await readFile(path, 'utf8').catch(() => '') === content) await rm(path, { force: true }) }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      const owner = JSON.parse(await readFile(path, 'utf8')) as { pid: number; hostname: string }
      if (owner.hostname !== hostname() || !Number.isInteger(owner.pid) || owner.pid <= 0) throw new Error(`Armazenamento bloqueado: ${path}. Verifique se há outro servidor em execução.`)
      let alive = true
      try { process.kill(owner.pid, 0) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') alive = false }
      if (alive) throw new Error(`Outra instância do Painel Ping está usando estes dados (PID ${owner.pid}). Pare a outra versão com Ctrl + C antes de iniciar.`)
      await rm(path, { force: true })
    }
  }
  throw new Error('Não foi possível obter acesso exclusivo aos dados. Tente novamente.')
}
