function fallbackCopyText(text: string) {
  const element = document.createElement('textarea')
  element.value = text
  element.setAttribute('readonly', '')
  element.style.position = 'fixed'
  element.style.opacity = '0'
  document.body.append(element)
  element.select()

  const copied = document.execCommand('copy')
  element.remove()

  if (!copied) {
    throw new Error('浏览器不允许访问剪贴板')
  }
}

export async function copyText(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }
  } catch {
    // Fall back to the legacy copy command for non-secure LAN origins.
  }

  fallbackCopyText(text)
}

async function toPngBlob(blob: Blob) {
  if (blob.type === 'image/png') return blob

  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0)
  bitmap.close()

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((png) => {
      if (png) resolve(png)
      else reject(new Error('图片转换失败'))
    }, 'image/png')
  })
}

export async function copyImage(url: string): Promise<'image' | 'url'> {
  const absoluteUrl = new URL(url, window.location.href).href

  try {
    if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      const response = await fetch(absoluteUrl, { credentials: 'same-origin' })
      if (!response.ok) throw new Error('图片加载失败')

      const png = await toPngBlob(await response.blob())
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
      return 'image'
    }
  } catch {
    // Image clipboard access is unavailable on many plain-HTTP LAN origins.
  }

  await copyText(absoluteUrl)
  return 'url'
}
