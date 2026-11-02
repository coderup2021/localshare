import type { HealthStatus } from '@localshare/contracts'
import { create } from 'zustand'

import { fetchHealth } from '../lib/health'

type ServiceState = {
  health: HealthStatus | null
  state: 'idle' | 'checking' | 'online' | 'offline'
  error: string | null
  check: () => Promise<void>
}

export const useServiceStore = create<ServiceState>((set) => ({
  health: null,
  state: 'idle',
  error: null,
  check: async () => {
    set({ state: 'checking', error: null })

    try {
      const health = await fetchHealth()
      set({ health, state: 'online' })
    } catch (error) {
      set({
        health: null,
        state: 'offline',
        error: error instanceof Error ? error.message : '无法连接本地服务',
      })
    }
  },
}))
