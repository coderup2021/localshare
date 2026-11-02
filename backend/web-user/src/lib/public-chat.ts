import {
  type CreatePublicMessageRequest,
  type PublicAttachment,
  type PublicBootstrapResponse,
  type PublicMessage,
  type PublicMessageListResponse,
  publicBootstrapResponseSchema,
  publicAttachmentSchema,
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

export async function uploadPublicAttachment(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<PublicAttachment> {
  try {
    const response = await api.post('/api/v1/public/uploads', file, {
      timeout: 120_000,
      headers: {
        'content-type': file.type || 'application/octet-stream',
        'x-file-name': encodeURIComponent(file.name),
      },
      onUploadProgress(event) {
        if (event.total) {
          onProgress?.(Math.round((event.loaded / event.total) * 100))
        }
      },
    })
    return publicAttachmentSchema.parse(response.data)
  } catch (error) {
    throw normalizeError(error)
  }
}

export function createClientRequestId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const versionByte = bytes[6] ?? 0
  const variantByte = bytes[8] ?? 0
  bytes[6] = (versionByte & 0x0f) | 0x40
  bytes[8] = (variantByte & 0x3f) | 0x80

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-')
}

export function messageTime(isoTimestamp: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(isoTimestamp))
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
