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

export const PUBLIC_CONVERSATION_SLUG = 'public' as const

export const publicVisitorSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
})

export type PublicVisitor = z.infer<typeof publicVisitorSchema>

export const publicConversationSchema = z.object({
  id: z.string().min(1),
  slug: z.literal(PUBLIC_CONVERSATION_SLUG),
  title: z.string().min(1),
})

export type PublicConversation = z.infer<typeof publicConversationSchema>

export const publicBootstrapResponseSchema = z.object({
  visitor: publicVisitorSchema,
  conversation: publicConversationSchema,
})

export type PublicBootstrapResponse = z.infer<typeof publicBootstrapResponseSchema>

export const publicMessageSchema = z.object({
  id: z.string().min(1),
  seq: z.number().int().positive(),
  senderType: z.enum(['visitor', 'admin']),
  senderId: z.string().min(1),
  senderName: z.string().min(1),
  kind: z.enum(['text', 'image', 'video', 'file']),
  text: z.string(),
  attachment: z
    .object({
      id: z.string().min(1),
      name: z.string().min(1),
      mimeType: z.string().min(1),
      sizeBytes: z.number().int().nonnegative(),
      kind: z.enum(['image', 'video', 'file']),
      url: z.string().min(1),
    })
    .optional(),
  createdAt: z.iso.datetime(),
})

export type PublicMessage = z.infer<typeof publicMessageSchema>

export const publicMessageListResponseSchema = z.object({
  messages: z.array(publicMessageSchema),
  hasMore: z.boolean(),
  nextBeforeSeq: z.number().int().positive().nullable(),
})

export type PublicMessageListResponse = z.infer<typeof publicMessageListResponseSchema>

export const createPublicMessageRequestSchema = z
  .object({
    text: z.string().trim().max(2_000).default(''),
    attachmentId: z.uuid().optional(),
    clientRequestId: z.uuid(),
  })
  .superRefine((value, context) => {
    if (!value.attachmentId && value.text.length === 0) {
      context.addIssue({
        code: 'custom',
        message: 'A message requires text or an attachment',
        path: ['text'],
      })
    }
  })

export type CreatePublicMessageRequest = z.infer<typeof createPublicMessageRequestSchema>

export const publicAttachmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  kind: z.enum(['image', 'video', 'file']),
  url: z.string().min(1),
})

export type PublicAttachment = z.infer<typeof publicAttachmentSchema>

export const publicRealtimeEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ready'),
    eventId: z.uuid(),
    occurredAt: z.iso.datetime(),
    latestSeq: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('message.created'),
    eventId: z.uuid(),
    occurredAt: z.iso.datetime(),
    message: publicMessageSchema,
  }),
])

export type PublicRealtimeEvent = z.infer<typeof publicRealtimeEventSchema>
