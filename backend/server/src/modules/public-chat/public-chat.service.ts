import {
  PUBLIC_CONVERSATION_SLUG,
  type CreatePublicMessageRequest,
  type PublicBootstrapResponse,
  type PublicMessage,
  type PublicMessageSearchResponse,
  type PublicMessageListResponse,
} from '@localshare/contracts'
import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm'

import { ensurePublicConversation } from '../../db/bootstrap'
import type { DatabaseClient } from '../../db/client'
import { anonymousVisitors, attachments, conversations, messages } from '../../db/schema'
import { HttpError } from '../../shared/http-error'
import type { AttachmentService } from './attachment.service'

function createVisitorId() {
  return crypto.randomUUID()
}

function displayNameForVisitor(id: string) {
  return `访客-${id.replaceAll('-', '').slice(0, 4).toUpperCase()}`
}

function toPublicMessage(
  row: typeof messages.$inferSelect,
  attachment?: ReturnType<AttachmentService['toPublicAttachment']>,
): PublicMessage {
  const recalledAt = row.recalledAt ? new Date(row.recalledAt).toISOString() : undefined

  return {
    id: row.id,
    seq: row.seq,
    senderType: row.senderType === 'admin' ? 'admin' : 'visitor',
    senderId: row.senderId,
    senderName: row.senderName,
    kind: row.kind === 'image' || row.kind === 'video' || row.kind === 'file' ? row.kind : 'text',
    text: recalledAt ? '' : row.text,
    ...(!recalledAt && attachment ? { attachment } : {}),
    createdAt: new Date(row.createdAt).toISOString(),
    ...(recalledAt ? { recalledAt } : {}),
  }
}

export class PublicChatService {
  constructor(
    private readonly client: DatabaseClient,
    private readonly attachments?: AttachmentService,
  ) {}

  async bootstrap(existingVisitorId: string | undefined): Promise<PublicBootstrapResponse> {
    await ensurePublicConversation(this.client)
    const now = Date.now()

    let visitor = existingVisitorId
      ? await this.client.db
          .select()
          .from(anonymousVisitors)
          .where(eq(anonymousVisitors.id, existingVisitorId))
          .limit(1)
          .then((rows) => rows[0])
      : undefined

    if (!visitor) {
      const id = createVisitorId()
      visitor = {
        id,
        displayName: displayNameForVisitor(id),
        createdAt: now,
        lastSeenAt: now,
      }
      await this.client.db.insert(anonymousVisitors).values(visitor)
    } else {
      await this.client.db
        .update(anonymousVisitors)
        .set({ lastSeenAt: now })
        .where(eq(anonymousVisitors.id, visitor.id))
    }

    const conversation = await this.client.db
      .select()
      .from(conversations)
      .where(eq(conversations.slug, PUBLIC_CONVERSATION_SLUG))
      .limit(1)
      .then((rows) => rows[0])

    if (!conversation) {
      throw new HttpError('PUBLIC_CONVERSATION_MISSING', 409, 'Public conversation is unavailable')
    }

    return {
      visitor: {
        id: visitor.id,
        displayName: visitor.displayName,
      },
      conversation: {
        id: conversation.id,
        slug: PUBLIC_CONVERSATION_SLUG,
        title: conversation.title,
      },
    }
  }

  async listMessages(
    beforeSeq: number | undefined,
    limit: number,
  ): Promise<PublicMessageListResponse> {
    const conversation = await this.getPublicConversation()
    const conditions = and(
      eq(messages.conversationId, conversation.id),
      isNull(messages.deletedAt),
      ...(beforeSeq ? [lt(messages.seq, beforeSeq)] : []),
    )

    const rows = await this.client.db
      .select()
      .from(messages)
      .where(conditions)
      .orderBy(desc(messages.seq))
      .limit(limit + 1)

    const hasMore = rows.length > limit
    const page = rows.slice(0, limit).reverse()
    const attachmentIds = page
      .filter((row) => !row.recalledAt)
      .map((row) => row.attachmentId)
      .filter((id): id is string => Boolean(id))
    const attachmentMap = this.attachments
      ? await this.attachments.findByIds(attachmentIds)
      : new Map()

    return {
      messages: page.map((row) => {
        const attachmentRow = row.attachmentId ? attachmentMap.get(row.attachmentId) : undefined
        return toPublicMessage(
          row,
          attachmentRow && this.attachments
            ? this.attachments.toPublicAttachment(attachmentRow)
            : undefined,
        )
      }),
      hasMore,
      nextBeforeSeq: hasMore && page[0] ? page[0].seq : null,
    }
  }

  async searchMessages(query: string, limit: number): Promise<PublicMessageSearchResponse> {
    const conversation = await this.getPublicConversation()
    const rows = await this.client.db
      .select({
        message: messages,
        attachment: attachments,
      })
      .from(messages)
      .leftJoin(attachments, eq(messages.attachmentId, attachments.id))
      .where(
        and(
          eq(messages.conversationId, conversation.id),
          isNull(messages.deletedAt),
          isNull(messages.recalledAt),
          or(
            sql`instr(lower(${messages.text}), lower(${query})) > 0`,
            sql`instr(lower(${attachments.originalName}), lower(${query})) > 0`,
          ),
        ),
      )
      .orderBy(desc(messages.seq))
      .limit(limit)

    return {
      query,
      messages: rows.map((row) =>
        toPublicMessage(
          row.message,
          row.attachment && this.attachments
            ? this.attachments.toPublicAttachment(row.attachment)
            : undefined,
        ),
      ),
    }
  }

  async createMessage(
    visitorId: string,
    request: CreatePublicMessageRequest,
  ): Promise<{ message: PublicMessage; created: boolean }> {
    const visitor = await this.client.db
      .select()
      .from(anonymousVisitors)
      .where(eq(anonymousVisitors.id, visitorId))
      .limit(1)
      .then((rows) => rows[0])

    if (!visitor) {
      throw new HttpError('VISITOR_REQUIRED', 401, 'Refresh the public channel before sending')
    }

    const conversation = await this.getPublicConversation()
    const existing = await this.client.db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.senderType, 'visitor'),
          eq(messages.senderId, visitor.id),
          eq(messages.clientRequestId, request.clientRequestId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0])

    if (existing) {
      const existingAttachment =
        existing.attachmentId && this.attachments
          ? (await this.attachments.findByIds([existing.attachmentId])).get(existing.attachmentId)
          : undefined
      return {
        message: toPublicMessage(
          existing,
          existingAttachment && this.attachments
            ? this.attachments.toPublicAttachment(existingAttachment)
            : undefined,
        ),
        created: false,
      }
    }

    const attachment = request.attachmentId
      ? await this.attachments?.pendingOwnedBy(visitor.id, request.attachmentId)
      : undefined

    if (request.attachmentId && !attachment) {
      throw new HttpError(
        'ATTACHMENT_NOT_AVAILABLE',
        409,
        'Attachment is missing or already attached to a message',
      )
    }

    const message = await this.client.db.transaction(async (transaction) => {
      const current = await transaction
        .select({ nextSeq: conversations.nextSeq })
        .from(conversations)
        .where(eq(conversations.id, conversation.id))
        .limit(1)
        .then((rows) => rows[0])

      if (!current) {
        throw new HttpError(
          'PUBLIC_CONVERSATION_MISSING',
          409,
          'Public conversation is unavailable',
        )
      }

      const now = Date.now()
      const row: typeof messages.$inferSelect = {
        id: crypto.randomUUID(),
        conversationId: conversation.id,
        seq: current.nextSeq,
        senderType: 'visitor',
        senderId: visitor.id,
        senderName: visitor.displayName,
        kind: attachment?.kind ?? 'text',
        text: request.text,
        clientRequestId: request.clientRequestId,
        attachmentId: attachment?.id ?? null,
        createdAt: now,
        deletedAt: null,
        recalledAt: null,
      }

      await transaction
        .update(conversations)
        .set({
          nextSeq: current.nextSeq + 1,
          updatedAt: now,
        })
        .where(eq(conversations.id, conversation.id))

      await transaction.insert(messages).values(row)
      if (attachment) {
        await transaction
          .update(attachments)
          .set({ status: 'attached' })
          .where(eq(attachments.id, attachment.id))
      }

      return row
    })

    return {
      message: toPublicMessage(
        message,
        attachment && this.attachments
          ? this.attachments.toPublicAttachment(attachment)
          : undefined,
      ),
      created: true,
    }
  }

  async recallMessage(
    visitorId: string,
    messageId: string,
  ): Promise<{ message: PublicMessage; recalled: boolean }> {
    const conversation = await this.getPublicConversation()
    const row = await this.client.db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.id, messageId),
          eq(messages.conversationId, conversation.id),
          isNull(messages.deletedAt),
        ),
      )
      .limit(1)
      .then((rows) => rows[0])

    if (!row) {
      throw new HttpError('MESSAGE_NOT_FOUND', 404, 'Message not found')
    }
    if (row.senderType !== 'visitor' || row.senderId !== visitorId) {
      throw new HttpError('MESSAGE_NOT_OWNED', 403, 'Only the sender can recall this message')
    }
    if (row.recalledAt) {
      return { message: toPublicMessage(row), recalled: false }
    }

    const recalledAt = Date.now()
    const updated = await this.client.db
      .update(messages)
      .set({ recalledAt })
      .where(and(eq(messages.id, messageId), isNull(messages.recalledAt)))
      .returning()
      .then((rows) => rows[0])

    if (!updated) {
      const current = await this.client.db
        .select()
        .from(messages)
        .where(eq(messages.id, messageId))
        .limit(1)
        .then((rows) => rows[0])

      if (!current) {
        throw new HttpError('MESSAGE_NOT_FOUND', 404, 'Message not found')
      }
      return { message: toPublicMessage(current), recalled: false }
    }

    return { message: toPublicMessage(updated), recalled: true }
  }

  private async getPublicConversation() {
    await ensurePublicConversation(this.client)
    const conversation = await this.client.db
      .select()
      .from(conversations)
      .where(eq(conversations.slug, PUBLIC_CONVERSATION_SLUG))
      .limit(1)
      .then((rows) => rows[0])

    if (!conversation) {
      throw new HttpError('PUBLIC_CONVERSATION_MISSING', 409, 'Public conversation is unavailable')
    }

    return conversation
  }
}
