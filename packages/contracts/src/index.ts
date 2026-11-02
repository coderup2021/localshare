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

export const ADMIN_USERNAME = 'localShare' as const
export const DEFAULT_ADMIN_PASSWORD = '12345678' as const

export const adminIdentitySchema = z.object({
  id: z.string().min(1),
  username: z.literal(ADMIN_USERNAME),
  mustChangePassword: z.boolean(),
  sessionExpiresAt: z.iso.datetime(),
})

export type AdminIdentity = z.infer<typeof adminIdentitySchema>

export const adminLoginRequestSchema = z.object({
  username: z.literal(ADMIN_USERNAME),
  password: z.string().min(8).max(128),
})

export type AdminLoginRequest = z.infer<typeof adminLoginRequestSchema>

export const adminSessionResponseSchema = z.object({
  admin: adminIdentitySchema,
})

export type AdminSessionResponse = z.infer<typeof adminSessionResponseSchema>

export const adminOptionalSessionResponseSchema = z.object({
  admin: adminIdentitySchema.nullable(),
})

export const adminPasswordChangeRequestSchema = z.object({
  currentPassword: z.string().min(8).max(128),
  newPassword: z.string().min(8).max(128),
})

export type AdminPasswordChangeRequest = z.infer<typeof adminPasswordChangeRequestSchema>

export const adminPasswordChangeResponseSchema = z.object({
  requiresLogin: z.literal(true),
})
