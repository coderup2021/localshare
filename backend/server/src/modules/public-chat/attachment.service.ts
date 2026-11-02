import { mkdirSync, rmSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import type { PublicAttachment } from '@localshare/contracts'
import { and, eq, inArray, isNull } from 'drizzle-orm'

import type { DatabaseClient } from '../../db/client'
import { anonymousVisitors, attachments, messages } from '../../db/schema'
import { HttpError } from '../../shared/http-error'

export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024

type AttachmentRow = typeof attachments.$inferSelect

function attachmentKind(mimeType: string): PublicAttachment['kind'] {
  const inlineImages = new Set([
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/avif',
    'image/bmp',
  ])
  const inlineVideos = new Set(['video/mp4', 'video/webm', 'video/ogg'])

  if (inlineImages.has(mimeType)) return 'image'
  if (inlineVideos.has(mimeType)) return 'video'
  return 'file'
}

function safeExtension(filename: string) {
  const extension = extname(filename).toLowerCase()
  return /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : ''
}

export class AttachmentService {
  private readonly uploadsDir: string

  constructor(
    private readonly client: DatabaseClient,
    dataDir: string,
  ) {
    this.uploadsDir = resolve(dataDir, 'uploads')
    mkdirSync(this.uploadsDir, { recursive: true })
  }

  async saveUpload(
    visitorId: string,
    file: {
      name: string
      mimeType: string
      body: ReadableStream<Uint8Array>
    },
  ): Promise<PublicAttachment> {
    const visitor = await this.client.db
      .select({ id: anonymousVisitors.id })
      .from(anonymousVisitors)
      .where(eq(anonymousVisitors.id, visitorId))
      .limit(1)
      .then((rows) => rows[0])

    if (!visitor) {
      throw new HttpError('VISITOR_REQUIRED', 401, 'Refresh the public channel before uploading')
    }

    const id = crypto.randomUUID()
    const originalName = basename(file.name || 'attachment')
    const storageKey = `${id}${safeExtension(originalName)}`
    const mimeType = file.mimeType || 'application/octet-stream'
    const kind = attachmentKind(mimeType)
    const path = this.resolveStoragePath(storageKey)
    const writer = Bun.file(path).writer()
    const hasher = new Bun.CryptoHasher('sha256')
    let sizeBytes = 0

    try {
      for await (const chunk of file.body) {
        sizeBytes += chunk.byteLength
        if (sizeBytes > MAX_ATTACHMENT_BYTES) {
          throw new HttpError('ATTACHMENT_TOO_LARGE', 413, 'Attachment exceeds the 100 MB limit')
        }
        writer.write(chunk)
        hasher.update(chunk)
      }

      if (sizeBytes === 0) {
        throw new HttpError('ATTACHMENT_EMPTY', 400, 'Attachment is empty')
      }

      await writer.end()
      const now = Date.now()
      const row: AttachmentRow = {
        id,
        uploaderType: 'visitor',
        uploaderId: visitor.id,
        storageKey,
        originalName,
        mimeType,
        sizeBytes,
        sha256: hasher.digest('hex'),
        kind,
        status: 'pending',
        createdAt: now,
      }
      await this.client.db.insert(attachments).values(row)
      return this.toPublicAttachment(row)
    } catch (error) {
      try {
        await writer.end()
      } catch {
        // The original upload error is more useful.
      }
      rmSync(path, { force: true })
      throw error
    }
  }

  async pendingOwnedBy(visitorId: string, attachmentId: string) {
    return this.client.db
      .select()
      .from(attachments)
      .where(
        and(
          eq(attachments.id, attachmentId),
          eq(attachments.uploaderType, 'visitor'),
          eq(attachments.uploaderId, visitorId),
          eq(attachments.status, 'pending'),
        ),
      )
      .limit(1)
      .then((rows) => rows[0])
  }

  async findByIds(ids: string[]) {
    if (ids.length === 0) return new Map<string, AttachmentRow>()

    const rows = await this.client.db.select().from(attachments).where(inArray(attachments.id, ids))

    return new Map(rows.map((row) => [row.id, row]))
  }

  async attachedForDownload(attachmentId: string) {
    const result = await this.client.db
      .select()
      .from(attachments)
      .innerJoin(messages, eq(messages.attachmentId, attachments.id))
      .where(
        and(
          eq(attachments.id, attachmentId),
          eq(attachments.status, 'attached'),
          isNull(messages.deletedAt),
          isNull(messages.recalledAt),
        ),
      )
      .limit(1)
      .then((rows) => rows[0])

    if (!result) {
      throw new HttpError('ATTACHMENT_NOT_FOUND', 404, 'Attachment not found')
    }

    return {
      row: result.attachments,
      path: this.resolveStoragePath(result.attachments.storageKey),
    }
  }

  toPublicAttachment(row: AttachmentRow): PublicAttachment {
    return {
      id: row.id,
      name: row.originalName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      kind: attachmentKind(row.mimeType),
      url: `/api/v1/public/attachments/${row.id}`,
    }
  }

  private resolveStoragePath(storageKey: string) {
    const path = resolve(join(this.uploadsDir, storageKey))
    if (!path.startsWith(`${this.uploadsDir}/`)) {
      throw new HttpError('ATTACHMENT_PATH_INVALID', 400, 'Invalid attachment path')
    }
    return path
  }
}
