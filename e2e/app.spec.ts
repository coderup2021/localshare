import { networkInterfaces } from 'node:os'
import { expect, test, type Page } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:7777'

function lanBaseURL() {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) {
        return `http://${address.address}:7777`
      }
    }
  }
  return null
}

function collectBrowserErrors(page: Page) {
  const errors: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') {
      const location = message.location().url
      errors.push(location ? `${message.text()} (${location})` : message.text())
    }
  })
  page.on('pageerror', (error) => {
    errors.push(error.message)
  })
  page.on('response', (response) => {
    if (response.status() >= 400) {
      errors.push(`${response.status()} ${response.url()}`)
    }
  })

  return errors
}

test('user message is visible to another anonymous browser', async ({ browser, page, request }) => {
  const browserErrors = collectBrowserErrors(page)

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'LocalShare' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '公共频道' })).toBeVisible()
  await expect(page.getByText('本地服务已连接')).toBeVisible()

  const secondContext = await browser.newContext()
  const secondPage = await secondContext.newPage()
  const secondBrowserErrors = collectBrowserErrors(secondPage)
  await secondPage.goto(baseURL)
  await expect(secondPage.getByRole('heading', { name: '公共频道' })).toBeVisible()
  await expect(secondPage.getByText('实时已连接')).toBeVisible()

  const message = `E2E public message ${Date.now()}`
  await page.getByLabel('消息内容').fill(message)
  await page.getByRole('button', { name: '发送' }).click()
  await expect(page.locator('article').filter({ hasText: message })).toBeVisible()
  await expect(secondPage.locator('article').filter({ hasText: message })).toBeVisible({
    timeout: 5_000,
  })

  const attachmentName = `e2e-${Date.now()}.txt`
  await page.getByLabel('选择附件').setInputFiles({
    name: attachmentName,
    mimeType: 'text/plain',
    buffer: Buffer.from('LocalShare attachment E2E'),
  })
  await expect(page.getByText(`已选择：${attachmentName}`)).toBeVisible()
  await page.getByRole('button', { name: '发送文件' }).click()

  const attachmentArticle = page.locator('article').filter({ hasText: attachmentName })
  await expect(attachmentArticle).toBeVisible()
  await expect(secondPage.locator('article').filter({ hasText: attachmentName })).toBeVisible({
    timeout: 5_000,
  })

  const attachmentURL = await attachmentArticle.getByRole('link').getAttribute('href')
  expect(attachmentURL).toBeTruthy()
  const attachmentResponse = await page.request.get(attachmentURL ?? '')
  expect(attachmentResponse.status()).toBe(200)
  expect(await attachmentResponse.text()).toBe('LocalShare attachment E2E')

  const imageName = `pixel-${Date.now()}.png`
  await page.getByLabel('选择附件').setInputFiles({
    name: imageName,
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nH0AAAAASUVORK5CYII=',
      'base64',
    ),
  })
  await page.getByRole('button', { name: '发送文件' }).click()
  await expect(page.getByRole('img', { name: imageName })).toBeVisible()
  await expect(secondPage.getByRole('img', { name: imageName })).toBeVisible({
    timeout: 5_000,
  })

  expect(secondBrowserErrors).toEqual([])
  await secondContext.close()

  const readiness = await request.get('/api/v1/health/ready')
  expect(readiness.status()).toBe(200)
  await expect(readiness.json()).resolves.toMatchObject({
    status: 'ok',
    checks: { database: 'up' },
  })
  expect(browserErrors).toEqual([])
})

test('admin logs in through /admin and reaches the API', async ({ page }) => {
  const browserErrors = collectBrowserErrors(page)

  await page.goto('/admin/')
  await expect(page.getByRole('heading', { name: '管理员登录' })).toBeVisible()
  await page.getByLabel('密码').fill('12345678')
  await page.getByRole('button', { name: /登\s*录/ }).click()

  await expect(page.getByRole('heading', { name: '工程概览' })).toBeVisible()
  await expect(page.getByText('服务在线')).toBeVisible()
  await expect(page.getByText('管理员账户')).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: '工程概览' })).toBeVisible()

  await page.getByRole('button', { name: '修改密码' }).click()
  await expect(page.getByRole('dialog', { name: '修改管理员密码' })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: /退\s*出\s*登\s*录/ }).click()
  await expect(page.getByRole('heading', { name: '管理员登录' })).toBeVisible()
  expect(browserErrors).toEqual([])
})

test('non-loopback browser can send public messages', async ({ browser }) => {
  const remoteURL = lanBaseURL()
  test.skip(!remoteURL, 'No non-loopback IPv4 interface is available')
  if (!remoteURL) return

  const context = await browser.newContext()
  const page = await context.newPage()
  const browserErrors = collectBrowserErrors(page)

  await page.goto(remoteURL)
  await expect(page.getByRole('heading', { name: '公共频道' })).toBeVisible()
  await expect(page.getByText('实时已连接')).toBeVisible()

  const message = `LAN E2E message ${Date.now()}`
  await page.getByLabel('消息内容').fill(message)
  await page.getByRole('button', { name: '发送' }).click()
  await expect(page.locator('article').filter({ hasText: message })).toBeVisible()
  expect(browserErrors).toEqual([])

  await context.close()
})
