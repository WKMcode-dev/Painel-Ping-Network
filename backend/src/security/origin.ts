import { env } from '../config/env.js'
/** Preserve same-origin requests through an HTTPS reverse proxy without trusting forwarded IPs. */
export const allowedOrigin = (origin: string | undefined, host: string | undefined) => !origin || env.allowedOrigins.includes(origin) || origin === `http://${host}` || origin === `https://${host}`
