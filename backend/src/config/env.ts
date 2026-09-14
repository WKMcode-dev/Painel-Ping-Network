import { resolve } from 'node:path'
import { config } from 'dotenv'
import { z } from 'zod'

config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../.env')] })

const schema = z.object({
  MAX_CONCURRENT_PINGS: z.coerce.number().int().min(1).max(64).default(8),
  PORT: z.coerce.number().int().positive().default(3333),
  PING_INTERVAL_MS: z.coerce.number().int().min(1000).default(5000),
  PING_TIMEOUT_MS: z.coerce.number().int().min(250).default(1500),
  FAILURE_THRESHOLD: z.coerce.number().int().min(1).default(2),
  HISTORY_LIMIT: z.coerce.number().int().min(20).max(1000).default(120),
  DATA_RETENTION_DAYS: z.coerce.number().int().min(1).default(30),
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),
})

const parsed = schema.parse(process.env)

export const env = {
  ...parsed,
  allowedOrigins: parsed.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()),
}
