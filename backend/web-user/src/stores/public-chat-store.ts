import type {
  CreatePublicMessageRequest,
  PublicConversation,
  PublicMessage,
  PublicVisitor,
} from '@localshare/contracts'
import { create } from 'zustand'

import {
  PublicChatError,
  bootstrapPublicChat,
  createClientRequestId,
  fetchPublicMessages,
  recallPublicMessage,
  sendPublicMessage,
  uploadPublicAttachment,
} from '../lib/public-chat'

type PublicChatState = {
  visitor: PublicVisitor | null
  conversation: PublicConversation | null
  messages: PublicMessage[]
  hasMore: boolean
  nextBeforeSeq: number | null
  initialized: boolean
  loading: boolean
  loadingOlder: boolean
  refreshing: boolean
  sending: boolean
  uploading: boolean
  uploadProgress: number
  uploadFileIndex: number
  uploadFileTotal: number
  uploadFileName: string | null
  recallingMessageId: string | null
  realtimeConnected: boolean
  error: string | null
  initialize: () => Promise<void>
  refresh: () => Promise<void>
  loadOlder: () => Promise<void>
  send: (request: CreatePublicMessageRequest) => Promise<boolean>
  sendFiles: (files: File[]) => Promise<boolean>
  recall: (messageId: string) => Promise<boolean>
  receiveMessage: (message: PublicMessage) => void
  receiveMessageRecalled: (message: PublicMessage) => void
  setRealtimeConnected: (connected: boolean) => void
}

function messageFromError(error: unknown) {
  if (error instanceof PublicChatError) return error.message
  return error instanceof Error ? error.message : '消息服务暂时不可用'
}

function upsertMessage(messages: PublicMessage[], message: PublicMessage) {
  return messages
    .filter((existing) => existing.id !== message.id)
    .concat(message)
    .sort((left, right) => left.seq - right.seq)
}

export const usePublicChatStore = create<PublicChatState>((set, get) => ({
  visitor: null,
  conversation: null,
  messages: [],
  hasMore: false,
  nextBeforeSeq: null,
  initialized: false,
  loading: false,
  loadingOlder: false,
  refreshing: false,
  sending: false,
  uploading: false,
  uploadProgress: 0,
  uploadFileIndex: 0,
  uploadFileTotal: 0,
  uploadFileName: null,
  recallingMessageId: null,
  realtimeConnected: false,
  error: null,
  initialize: async () => {
    if (get().initialized || get().loading) return

    set({ loading: true, error: null })
    try {
      const bootstrap = await bootstrapPublicChat()
      const history = await fetchPublicMessages()
      set({
        visitor: bootstrap.visitor,
        conversation: bootstrap.conversation,
        messages: history.messages,
        hasMore: history.hasMore,
        nextBeforeSeq: history.nextBeforeSeq,
        initialized: true,
        loading: false,
      })
    } catch (error) {
      set({
        initialized: false,
        loading: false,
        error: messageFromError(error),
      })
    }
  },
  refresh: async () => {
    if (!get().initialized || get().refreshing) return

    set({ refreshing: true })
    try {
      const history = await fetchPublicMessages()
      const merged = [...get().messages, ...history.messages]
        .filter(
          (message, index, all) =>
            all.findIndex((candidate) => candidate.id === message.id) === index,
        )
        .sort((left, right) => left.seq - right.seq)

      set({
        messages: merged,
        hasMore: get().messages.length === 0 ? history.hasMore : get().hasMore,
        nextBeforeSeq: get().messages.length === 0 ? history.nextBeforeSeq : get().nextBeforeSeq,
        refreshing: false,
        error: null,
      })
    } catch (error) {
      set({ refreshing: false, error: messageFromError(error) })
    }
  },
  loadOlder: async () => {
    const state = get()
    if (!state.hasMore || !state.nextBeforeSeq || state.loadingOlder) return

    set({ loadingOlder: true, error: null })
    try {
      const history = await fetchPublicMessages(state.nextBeforeSeq)
      const merged = [...history.messages, ...state.messages]
        .filter(
          (message, index, all) =>
            all.findIndex((candidate) => candidate.id === message.id) === index,
        )
        .sort((left, right) => left.seq - right.seq)

      set({
        messages: merged,
        hasMore: history.hasMore,
        nextBeforeSeq: history.nextBeforeSeq,
        loadingOlder: false,
      })
    } catch (error) {
      set({ loadingOlder: false, error: messageFromError(error) })
    }
  },
  send: async (request) => {
    if (get().sending) return false

    set({ sending: true, error: null })
    try {
      const message = await sendPublicMessage(request)
      const nextMessages = upsertMessage(get().messages, message)

      set({ messages: nextMessages, sending: false })
      return true
    } catch (error) {
      set({ sending: false, error: messageFromError(error) })
      return false
    }
  },
  sendFiles: async (files) => {
    const state = get()
    if (files.length === 0 || state.sending || state.uploading) {
      return false
    }

    set({
      uploading: true,
      uploadProgress: 0,
      uploadFileIndex: 1,
      uploadFileTotal: files.length,
      uploadFileName: files[0]?.name ?? null,
      error: null,
    })

    for (const [index, file] of files.entries()) {
      set({
        uploadFileIndex: index + 1,
        uploadFileName: file.name,
      })

      try {
        const attachment = await uploadPublicAttachment(file, (percent) => {
          set({
            uploadProgress: Math.round(((index + percent / 100) / files.length) * 100),
          })
        })
        const message = await sendPublicMessage({
          text: '',
          attachmentId: attachment.id,
          clientRequestId: createClientRequestId(),
        })
        const nextMessages = upsertMessage(get().messages, message)

        set({ messages: nextMessages })
      } catch (error) {
        const prefix = files.length > 1 ? `${file.name}：` : ''
        set({
          uploading: false,
          uploadProgress: 0,
          uploadFileIndex: 0,
          uploadFileTotal: 0,
          uploadFileName: null,
          error: `${prefix}${messageFromError(error)}`,
        })
        return false
      }
    }

    set({
      uploading: false,
      uploadProgress: 100,
      uploadFileIndex: 0,
      uploadFileTotal: 0,
      uploadFileName: null,
    })
    return true
  },
  recall: async (messageId) => {
    if (get().recallingMessageId) return false

    set({ recallingMessageId: messageId, error: null })
    try {
      const message = await recallPublicMessage(messageId)
      set({
        messages: upsertMessage(get().messages, message),
        recallingMessageId: null,
      })
      return true
    } catch (error) {
      set({
        recallingMessageId: null,
        error: messageFromError(error),
      })
      return false
    }
  },
  receiveMessage: (message) => {
    set({ messages: upsertMessage(get().messages, message), error: null })
  },
  receiveMessageRecalled: (message) => {
    set({ messages: upsertMessage(get().messages, message), error: null })
  },
  setRealtimeConnected: (connected) => set({ realtimeConnected: connected }),
}))
