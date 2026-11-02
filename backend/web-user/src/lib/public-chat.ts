import {
  type CreatePublicMessageRequest,
  type PublicBootstrapResponse,
  type PublicMessage,
  type PublicMessageListResponse,
  publicBootstrapResponseSchema,
  publicMessageListResponseSchema,
  publicMessageSchema,
} from '@localshare/contracts'
import axios from 'axios'

const api = axios.create({
  baseURL: '/',
  timeout: 10_000,
})

export class PublicChatError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'PublicChatError'
  }
}

function normalizeError(error: unknown) {
  if (axios.isAxiosError(error) && error.response) {
    const data = error.response.data as { error?: { code?: string; message?: string } }
    return new PublicChatError(
      data.error?.code ?? 'PUBLIC_CHAT_FAILED',
      data.error?.message ?? '消息服务暂时不可用',
    )
  }

  return new PublicChatError(
    'PUBLIC_CHAT_FAILED',
    error instanceof Error ? error.message : '消息服务暂时不可用',
  )
}

export async function bootstrapPublicChat(): Promise<PublicBootstrapResponse> {
  try {
    const response = await api.get('/api/v1/public/bootstrap')
    return publicBootstrapResponseSchema.parse(response.data)
  } catch (error) {
    throw normalizeError(error)
  }
}

export async function fetchPublicMessages(beforeSeq?: number): Promise<PublicMessageListResponse> {
  try {
    const response = await api.get('/api/v1/public/messages', {
      params: beforeSeq ? { beforeSeq, limit: 50 } : { limit: 50 },
    })
    return publicMessageListResponseSchema.parse(response.data)
  } catch (error) {
    throw normalizeError(error)
  }
}

export async function sendPublicMessage(
  request: CreatePublicMessageRequest,
): Promise<PublicMessage> {
  try {
    const response = await api.post('/api/v1/public/messages', request)
    return publicMessageSchema.parse(response.data)
  } catch (error) {
    throw normalizeError(error)
  }
}

export function messageTime(isoTimestamp: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(isoTimestamp))
}
