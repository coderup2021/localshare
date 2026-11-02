import type { AdminIdentity } from '@localshare/contracts'
import { create } from 'zustand'

import {
  AdminApiError,
  authErrorMessage,
  changeAdminPassword,
  fetchAdminSession,
  loginAdmin,
  logoutAdmin,
} from '../lib/auth'

type AuthState = {
  status: 'checking' | 'guest' | 'authenticated'
  admin: AdminIdentity | null
  busy: boolean
  error: string | null
  notice: string | null
  initialize: () => Promise<void>
  login: (password: string) => Promise<boolean>
  logout: () => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>
  clearMessages: () => void
}

function messageFromError(error: unknown) {
  if (error instanceof AdminApiError) return authErrorMessage(error)
  return error instanceof Error ? error.message : '操作失败，请稍后重试'
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'checking',
  admin: null,
  busy: false,
  error: null,
  notice: null,
  initialize: async () => {
    try {
      const admin = await fetchAdminSession()
      set({
        status: admin ? 'authenticated' : 'guest',
        admin,
        error: null,
      })
    } catch (error) {
      set({
        status: 'guest',
        admin: null,
        error: messageFromError(error),
      })
    }
  },
  login: async (password) => {
    set({ busy: true, error: null, notice: null })
    try {
      const admin = await loginAdmin(password)
      set({ status: 'authenticated', admin, busy: false })
      return true
    } catch (error) {
      set({ status: 'guest', admin: null, busy: false, error: messageFromError(error) })
      return false
    }
  },
  logout: async () => {
    set({ busy: true, error: null, notice: null })
    try {
      await logoutAdmin()
    } finally {
      set({
        status: 'guest',
        admin: null,
        busy: false,
      })
    }
  },
  changePassword: async (currentPassword, newPassword) => {
    set({ busy: true, error: null, notice: null })
    try {
      await changeAdminPassword({ currentPassword, newPassword })
      set({
        status: 'guest',
        admin: null,
        busy: false,
        notice: '密码已修改，请使用新密码重新登录',
      })
      return true
    } catch (error) {
      set({ busy: false, error: messageFromError(error) })
      return false
    }
  },
  clearMessages: () => set({ error: null, notice: null }),
}))
