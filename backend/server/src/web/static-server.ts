import { extname, resolve } from 'node:path'

import { isPathWithin } from '../shared/path'

type WebHandlerOptions = {
  app: {
    fetch(request: Request, environment?: unknown): Response | Promise<Response>
  }
  userRoot: string
  adminRoot: string
}

function resolveStaticPath(root: string, pathname: string) {
  const normalized = pathname.replace(/^\/+/, '')
  const path = resolve(root, normalized)
  if (path !== root && !isPathWithin(root, path)) return null
  return path
}

async function fileResponse(path: string, request: Request, immutable: boolean) {
  const file = Bun.file(path)
  if (!(await file.exists())) return null

  const headers = new Headers({
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'content-type': file.type || 'application/octet-stream',
    'x-content-type-options': 'nosniff',
  })

  if (request.method === 'HEAD') {
    headers.set('content-length', String(file.size))
    return new Response(null, { headers })
  }

  return new Response(file, { headers })
}

async function serveFrontend(
  request: Request,
  root: string,
  basePath: '/' | '/admin/',
): Promise<Response> {
  const url = new URL(request.url)
  let pathname = url.pathname

  if (basePath === '/admin/' && pathname === '/admin') {
    return Response.redirect(new URL('/admin/', url).href, 308)
  }

  if (pathname === basePath) pathname = `${basePath}index.html`

  const relativePath =
    basePath === '/admin/' ? pathname.replace(/^\/admin\//, '') : pathname.replace(/^\//, '')
  const assetPath = resolveStaticPath(root, relativePath)
  if (!assetPath) {
    return new Response('Not found', { status: 404 })
  }

  const immutable = relativePath.includes('assets/')
  const response = await fileResponse(assetPath, request, immutable)
  if (response) return response

  const acceptsHtml = request.headers.get('accept')?.includes('text/html')
  if (request.method === 'GET' && acceptsHtml && extname(relativePath) === '') {
    const fallback = await fileResponse(resolve(root, 'index.html'), request, false)
    if (fallback) return fallback
  }

  return new Response('Not found', { status: 404 })
}

export function createWebHandler({ app, userRoot, adminRoot }: WebHandlerOptions) {
  return async (request: Request, server?: unknown): Promise<Response> => {
    const url = new URL(request.url)

    if (url.pathname === '/ws' || url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return app.fetch(request, server)
    }

    if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
      return serveFrontend(request, adminRoot, '/admin/')
    }

    return serveFrontend(request, userRoot, '/')
  }
}
