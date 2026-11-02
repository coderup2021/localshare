import { useEffect } from 'react'
import { ConfigProvider, Spin } from 'antd'

import { AdminDashboard } from './components/AdminDashboard'
import { LoginPage } from './components/LoginPage'
import { useAuthStore } from './stores/auth-store'

export function App() {
  const status = useAuthStore((state) => state.status)
  const initialize = useAuthStore((state) => state.initialize)

  useEffect(() => {
    void initialize()
  }, [initialize])

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#24744f',
          borderRadius: 12,
        },
      }}
    >
      {status === 'checking' ? (
        <div className="admin-loading">
          <Spin size="large" />
          <span>正在验证管理员会话…</span>
        </div>
      ) : status === 'guest' ? (
        <LoginPage />
      ) : (
        <AdminDashboard />
      )}
    </ConfigProvider>
  )
}
