import { z } from 'zod'
import { canonicalHost } from '../security/service-target.js'
import { safeDisplayText } from '../utils/display-text.js'
import { isValidHost } from '../utils/host-validation.js'

/** Leitura legada preserva dados; esquemas de edição aplicam as regras atuais. */
export const storedHostSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-zA-Z0-9_-]+$/),
    name: z.string().trim().min(1).max(100),
    address: z.string().trim().refine(isValidHost, 'IP ou hostname inválido'),
    group: z.string().trim().min(1).max(100),
    location: z.string().trim().max(100),
    checks: z
      .array(
        z
          .object({
            id: z.string().min(1).max(80),
            type: z.enum(['tcp', 'http']),
            port: z.number().int().min(1).max(65535).optional(),
            url: z.string().url().max(2048).optional(),
            expectedStatus: z.number().int().min(100).max(599).optional(),
          })
          .superRefine((check, ctx) => {
            if (check.type === 'tcp' && !check.port)
              ctx.addIssue({ code: 'custom', message: 'Informe a porta TCP' })
            if (check.type === 'http') {
              let valid = false
              try {
                const url = new URL(check.url ?? '')
                valid = ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
              } catch {}
              if (!valid)
                ctx.addIssue({ code: 'custom', message: 'Informe URL HTTP/HTTPS sem credenciais' })
            }
          }),
      )
      .max(8)
      .refine(
        (checks) => new Set(checks.map((c) => c.id)).size === checks.length,
        'IDs de verificações duplicados',
      )
      .optional(),
    description: z.string().max(500).optional(),
    enabled: z.boolean().default(true),
    maintenanceStart: z.string().datetime().nullable().optional(),
    maintenanceEnd: z.string().datetime().nullable().optional(),
  })
  .refine(
    (h) =>
      (!h.maintenanceStart && !h.maintenanceEnd) ||
      (h.maintenanceStart &&
        h.maintenanceEnd &&
        Date.parse(h.maintenanceEnd) > Date.parse(h.maintenanceStart)),
    'Informe início e fim válidos para a manutenção',
  )
export const hostSchema = storedHostSchema
  .refine(
    (h) =>
      (h.checks ?? []).every(
        (check) =>
          check.type !== 'http' ||
          (() => {
            try {
              return canonicalHost(new URL(check.url!).hostname) === canonicalHost(h.address)
            } catch {
              return false
            }
          })(),
      ),
    'A URL HTTP precisa pertencer ao IP ou hostname cadastrado',
  )
  .refine(
    (h) => [h.name, h.group, h.location, h.description ?? ''].every(safeDisplayText),
    'Não use IPs nem caracteres de controle em nome, setor, local ou descrição; use o campo de endereço',
  )
export const configSchema = z.object({
  hosts: z
    .array(hostSchema)
    .max(200)
    .refine((h) => new Set(h.map((x) => x.id)).size === h.length, 'IDs duplicados'),
  failureThreshold: z.number().int().min(1).max(20),
  recoveryThreshold: z.number().int().min(1).max(20),
})
export const storedConfigSchema = configSchema.extend({
  hosts: z
    .array(storedHostSchema)
    .max(200)
    .refine((h) => new Set(h.map((x) => x.id)).size === h.length, 'IDs duplicados'),
})
export type MonitorConfig = z.infer<typeof configSchema>
