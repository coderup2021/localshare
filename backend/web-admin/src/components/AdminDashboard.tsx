import { useEffect, useState } from 'react'
import { Alert, Button, Card, Layout, Space, Statistic, Tag, Typography } from 'antd'

import { statusLabel } from '../lib/health'
import { useAuthStore } from '../stores/auth-store'
import { useServiceStore } from '../stores/service-store'
import { ChangePasswordDialog } from './ChangePasswordDialog'

const { Content, Header } = Layout

export function AdminDashboard() {
  const [passwordOpen, setPasswordOpen] = useState(false)
  const admin = useAuthStore((state) => state.admin)
  const busy = useAuthStore((state) => state.busy)
  const logout = useAuthStore((state) => state.logout)
  const healthState = useServiceStore((service) => service.state)
  const healthError = useServiceStore((service) => service.error)
  const checkHealth = useServiceStore((service) => service.check)
  const webPort = window.location.port || (window.location.protocol === 'https:' ? '443' : '80')
  const apiPort = webPort === '8888' ? '8887' : '5678'

  useEffect(() => {
    void checkHealth()
  }, [checkHealth])

  return (
    <>
      <Layout className="admin-layout">
        <Header className="admin-header">
          <div>
            <Typography.Text strong style={{ display: 'block', fontSize: 18 }}>
              LocalShare Admin
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              当前管理员：{admin?.username}
            </Typography.Text>
          </div>
          <Space size="middle">
            <Tag color={healthState === 'online' ? 'green' : 'default'}>
              {statusLabel(healthState)}
            </Tag>
            <Button onClick={() => setPasswordOpen(true)}>修改密码</Button>
            <Button loading={busy} onClick={() => void logout()}>
              退出登录
            </Button>
          </Space>
        </Header>

        <Content className="admin-content">
          <Typography.Title level={2} className="admin-title">
            工程概览
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="admin-description">
            管理员认证已经启用。后续功能将在鉴权后的管理端逐步接入。
          </Typography.Paragraph>

          {admin?.mustChangePassword ? (
            <Alert
              type="warning"
              showIcon
              title="当前仍在使用初始密码，请尽快修改。"
              className="dashboard-alert"
            />
          ) : null}

          {healthError ? (
            <Alert
              type="error"
              showIcon
              title="API 健康检查失败"
              description={healthError}
              className="dashboard-alert"
            />
          ) : null}

          <div className="admin-metrics">
            <Card>
              <Statistic title="API 端口" value={apiPort} />
            </Card>
            <Card>
              <Statistic title="Web 端口" value={webPort} />
            </Card>
            <Card>
              <Statistic title="管理员账户" value="localShare" />
            </Card>
          </div>

          <Card className="admin-follow-up" title="当前阶段">
            <Space orientation="vertical" size="middle">
              <Typography.Text>
                唯一管理员已可登录、注销与修改密码，服务端会话使用 HttpOnly Cookie。
              </Typography.Text>
              <Button loading={healthState === 'checking'} onClick={() => void checkHealth()}>
                重新检查服务
              </Button>
            </Space>
          </Card>
        </Content>
      </Layout>

      <ChangePasswordDialog open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </>
  )
}
