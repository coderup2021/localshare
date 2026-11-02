import { create } from 'zustand'

import { fetchAdminHealth } from '../lib/health'

type ServiceState = {
  state: 'idle' | 'checking' | 'online' | 'offline'
  error: string | null
  check: () => Promise<void>
}

export const useServiceStore = create<ServiceState>((set) => ({
  state: 'idle',
  error: null,
  check: async () => {
    set({ state: 'checking', error: null })

    try {
      await fetchAdminHealth()
      set({ state: 'online' })
    } catch (error) {
      set({
        state: 'offline',
        error: error instanceof Error ? error.message : '无法连接本地服务',
      })
    }
  },
}))
