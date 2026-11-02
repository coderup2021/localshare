import { z } from 'zod'

export const healthStatusSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  service: z.literal('localshare-server'),
  timestamp: z.iso.datetime(),
  checks: z
    .object({
      database: z.enum(['up', 'down']),
    })
    .optional(),
})

export type HealthStatus = z.infer<typeof healthStatusSchema>

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    requestId: z.string().min(1),
  }),
})

export type ApiError = z.infer<typeof apiErrorSchema>
