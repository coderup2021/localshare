import { ADMIN_USERNAME, adminLoginRequestSchema } from '@localshare/contracts'
import { Alert, Button, Card, Form, Input, Typography } from 'antd'
import { useAuthStore } from '../stores/auth-store'

type LoginValues = {
  password: string
}

export function LoginPage() {
  const [form] = Form.useForm<LoginValues>()
  const login = useAuthStore((state) => state.login)
  const busy = useAuthStore((state) => state.busy)
  const error = useAuthStore((state) => state.error)
  const notice = useAuthStore((state) => state.notice)

  const submit = async ({ password }: LoginValues) => {
    const parsed = adminLoginRequestSchema.safeParse({
      username: ADMIN_USERNAME,
      password,
    })

    if (!parsed.success) {
      form.setFields([{ name: 'password', errors: ['密码至少需要 8 个字符'] }])
      return
    }

    await login(parsed.data.password)
  }

  return (
    <main className="login-shell">
      <Card className="login-card" variant="borderless">
        <div className="login-brand">
          <span className="login-mark">LS</span>
          <div>
            <Typography.Title level={2} className="login-title">
              管理员登录
            </Typography.Title>
            <Typography.Text type="secondary">LocalShare 局域网管理端</Typography.Text>
          </div>
        </div>

        <Typography.Paragraph type="secondary" className="login-help">
          唯一账户：<Typography.Text code>{ADMIN_USERNAME}</Typography.Text>
          <br />
          初始密码：<Typography.Text code>12345678</Typography.Text>，登录后请及时修改。
        </Typography.Paragraph>

        {notice ? <Alert type="success" showIcon title={notice} className="login-alert" /> : null}
        {error ? <Alert type="error" showIcon title={error} className="login-alert" /> : null}

        <Form
          form={form}
          layout="vertical"
          initialValues={{ password: '' }}
          onFinish={(values) => void submit(values)}
          requiredMark={false}
        >
          <Form.Item
            label="管理员账户"
            name="username"
            initialValue={ADMIN_USERNAME}
            rules={[{ required: true }]}
          >
            <Input disabled />
          </Form.Item>
          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              autoFocus
              autoComplete="current-password"
              placeholder="输入管理员密码"
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={busy}>
            登录
          </Button>
        </Form>
      </Card>
    </main>
  )
}
