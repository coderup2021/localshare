import { adminPasswordChangeRequestSchema } from '@localshare/contracts'
import { Alert, Button, Form, Input, Modal } from 'antd'
import { useAuthStore } from '../stores/auth-store'

type PasswordValues = {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

type ChangePasswordDialogProps = {
  open: boolean
  onClose: () => void
}

export function ChangePasswordDialog({ open, onClose }: ChangePasswordDialogProps) {
  const [form] = Form.useForm<PasswordValues>()
  const busy = useAuthStore((state) => state.busy)
  const error = useAuthStore((state) => state.error)
  const changePassword = useAuthStore((state) => state.changePassword)
  const clearMessages = useAuthStore((state) => state.clearMessages)

  const close = () => {
    if (busy) return
    form.resetFields()
    clearMessages()
    onClose()
  }

  const submit = async (values: PasswordValues) => {
    const parsed = adminPasswordChangeRequestSchema.safeParse({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    })

    if (!parsed.success) {
      form.setFields([{ name: 'newPassword', errors: ['新密码至少需要 8 个字符'] }])
      return
    }

    if (values.newPassword !== values.confirmPassword) {
      form.setFields([{ name: 'confirmPassword', errors: ['两次输入的新密码不一致'] }])
      return
    }

    const success = await changePassword(parsed.data.currentPassword, parsed.data.newPassword)
    if (success) {
      form.resetFields()
      onClose()
    }
  }

  return (
    <Modal title="修改管理员密码" open={open} onCancel={close} footer={null} destroyOnHidden>
      <Alert
        type="warning"
        showIcon
        title="修改密码后，所有已登录会话都会失效。"
        className="password-alert"
      />
      {error ? <Alert type="error" showIcon title={error} className="password-alert" /> : null}
      <Form form={form} layout="vertical" onFinish={(values) => void submit(values)}>
        <Form.Item
          label="当前密码"
          name="currentPassword"
          rules={[{ required: true, message: '请输入当前密码' }]}
        >
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <Form.Item
          label="新密码"
          name="newPassword"
          rules={[{ required: true, message: '请输入新密码' }]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          label="确认新密码"
          name="confirmPassword"
          rules={[{ required: true, message: '请再次输入新密码' }]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={busy}>
          保存新密码
        </Button>
      </Form>
    </Modal>
  )
}
