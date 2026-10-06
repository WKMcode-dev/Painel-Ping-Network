import snmp from 'net-snmp'
import { lookup } from 'node:dns/promises'
import { z } from 'zod'
import { safeServiceAddress } from '../security/service-target.js'
import type { SnmpConfig, SnmpInterface, SnmpResult } from '../types/snmp.js'

const profileSchema = z.discriminatedUnion('version', [
  z.object({ version: z.literal('2c'), community: z.string().min(1).max(256) }),
  z.object({
    version: z.literal('3'),
    username: z.string().min(1).max(64),
    authPassword: z.string().min(8).max(256),
    privPassword: z.string().min(8).max(256),
    authProtocol: z.enum(['sha', 'sha256']).default('sha256'),
    context: z.string().max(128).default(''),
  }),
])
/** Perfis só existem no ambiente do coletor, nunca no cadastro público ou no snapshot. */
export async function probeSnmp(address: string, config: SnmpConfig): Promise<SnmpResult> {
  const unknown = (error: string): SnmpResult => ({
    status: 'unknown',
    checkedAt: new Date().toISOString(),
    interfaces: [],
    error,
  })
  let profile: z.infer<typeof profileSchema>
  try {
    profile = profileSchema.parse(JSON.parse(process.env[`SNMP_PROFILE_${config.profile}`] ?? ''))
  } catch {
    return unknown('Perfil SNMP ausente ou inválido no coletor')
  }
  let target: string
  let resolutionTimer: NodeJS.Timeout | undefined
  try {
    target = await Promise.race([
      lookup(address).then((result) => result.address),
      new Promise<never>((_, reject) => {
        resolutionTimer = setTimeout(() => reject(new Error('DNS timeout')), 1000)
      }),
    ])
  } catch {
    return unknown('Resolução do destino SNMP indisponível')
  } finally {
    clearTimeout(resolutionTimer)
  }
  if (!safeServiceAddress(target)) return unknown('Destino SNMP não autorizado')
  const options = {
    port: config.port,
    timeout: 1000,
    retries: 0,
    transport: target.includes(':') ? ('udp6' as const) : ('udp4' as const),
    version: snmp.Version2c,
  }
  const session =
    profile.version === '2c'
      ? snmp.createSession(target, profile.community, options)
      : snmp.createV3Session(
          target,
          {
            name: profile.username,
            level: snmp.SecurityLevel.authPriv,
            authProtocol:
              profile.authProtocol === 'sha256'
                ? snmp.AuthProtocols.sha256
                : snmp.AuthProtocols.sha,
            authKey: profile.authPassword,
            privProtocol: snmp.PrivProtocols.aes,
            privKey: profile.privPassword,
          },
          { ...options, version: snmp.Version3, context: profile.context },
        )
  const values = new Map<string, unknown>()
  const uptime = '1.3.6.1.2.1.1.3.0'
  const oid = (column: number, index: number) => `1.3.6.1.2.1.2.2.1.${column}.${index}`
  const oids = [
    uptime,
    ...config.interfaces.flatMap((index) => [oid(2, index), oid(7, index), oid(8, index)]),
  ]
  let timer: NodeJS.Timeout | undefined
  try {
    await Promise.race([
      (async () => {
        for (let i = 0; i < oids.length; i += 24)
          await new Promise<void>((resolve, reject) => {
            session.get(oids.slice(i, i + 24), (error, bindings) => {
              if (error) {
                reject(error)
                return
              }
              for (const binding of bindings ?? [])
                if (!snmp.isVarbindError(binding)) values.set(binding.oid, binding.value)
              resolve()
            })
          })
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), 5000)
      }),
    ])
    const number = (key: string) =>
      typeof values.get(key) === 'number' && Number.isFinite(values.get(key))
        ? (values.get(key) as number)
        : null
    const interfaces: SnmpInterface[] = config.interfaces.map((index) => ({
      index,
      name: String(values.get(oid(2, index)) ?? `Interface ${index}`).slice(0, 100),
      adminStatus: number(oid(7, index)),
      operStatus: number(oid(8, index)),
    }))
    if (number(uptime) === null && !interfaces.some((item) => item.operStatus !== null))
      return unknown('Objetos SNMP indisponíveis no equipamento')
    return {
      status: 'available',
      checkedAt: new Date().toISOString(),
      uptimeTicks: number(uptime) ?? undefined,
      interfaces,
    }
  } catch {
    return unknown('Verificação SNMP indisponível: sem resposta válida')
  } finally {
    clearTimeout(timer)
    session.close()
  }
}
