import { useEffect } from 'react'
import {
  Alert,
  Button,
  Card,
  ConfigProvider,
  Layout,
  Space,
  Statistic,
  Tag,
  Typography,
} from 'antd'

import { statusLabel } from './lib/health'
import { useServiceStore } from './stores/service-store'

const { Content, Header } = Layout

export function App() {
  const state = useServiceStore((service) => service.state)
  const error = useServiceStore((service) => service.error)
  const check = useServiceStore((service) => service.check)

  useEffect(() => {
    void check()
  }, [check])

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#24744f',
          borderRadius: 12,
        },
      }}
    >
      <Layout className="admin-layout">
        <Header className="admin-header">
          <div>
            <Typography.Text strong style={{ display: 'block', fontSize: 18 }}>
              LocalShare Admin
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              局域网信息分享管理端
            </Typography.Text>
          </div>
          <Tag color={state === 'online' ? 'green' : state === 'checking' ? 'gold' : 'default'}>
            {statusLabel(state)}
          </Tag>
        </Header>

        <Content className="admin-content">
          <Typography.Title level={2} className="admin-title">
            工程概览
          </Typography.Title>
          <Typography.Paragraph type="secondary" className="admin-description">
            M0 基础工程已经启动。管理员认证和公共消息管理将在后续里程碑接入。
          </Typography.Paragraph>

          {error ? (
            <Alert
              style={{ marginBottom: 24 }}
              type="error"
              showIcon
              message="API 健康检查失败"
              description={error}
            />
          ) : null}

          <div className="admin-metrics">
            <Card>
              <Statistic title="API 端口" value={5678} />
            </Card>
            <Card>
              <Statistic title="Web 端口" value={7777} />
            </Card>
            <Card>
              <Statistic title="管理员账户" value="localShare" />
            </Card>
          </div>

          <Card className="admin-follow-up" title="下一步">
            <Space orientation="vertical" size="middle">
              <Typography.Text>
                当前阶段先验证统一入口、API 代理、SQLite 初始化和质量检查。
              </Typography.Text>
              <Button type="primary" loading={state === 'checking'} onClick={() => void check()}>
                重新检查服务
              </Button>
            </Space>
          </Card>
        </Content>
      </Layout>
    </ConfigProvider>
  )
}
