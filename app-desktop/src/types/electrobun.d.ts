declare module 'electrobun' {
  export interface ElectrobunConfig {
    app: {
      name: string
      identifier: string
      version: string
    }
    build: {
      mainProcess: 'bun' | 'cottontail'
      bun: { entrypoint: string }
      copy?: Record<string, string>
      watchIgnore?: string[]
      mac?: {
        bundleCEF?: boolean
        codesign?: boolean
        notarize?: boolean
        createDmg?: boolean
        icons?: string
      }
      linux?: { bundleCEF?: boolean; icon?: string }
      win?: { bundleCEF?: boolean; icon?: string }
      release?: { baseUrl?: string; generatePatch?: boolean }
    }
  }
}

declare module 'electrobun/main' {
  type RequestSchema = Record<string, { params: unknown; response: unknown }>
  type MessageSchema = Record<string, unknown>

  export type RPCSchema<
    T extends { requests?: RequestSchema; messages?: MessageSchema } = {
      requests: RequestSchema
      messages: MessageSchema
    },
  > = {
    requests: T['requests'] extends RequestSchema ? T['requests'] : RequestSchema
    messages: T['messages'] extends MessageSchema ? T['messages'] : MessageSchema
  }

  export type ElectrobunRPCSchema = {
    bun: RPCSchema<{ requests?: RequestSchema; messages?: MessageSchema }>
    webview: RPCSchema<{ requests?: RequestSchema; messages?: MessageSchema }>
  }

  export type RPCWithTransport = {
    setTransport: (transport: {
      send?: (data: unknown) => void | PromiseLike<void>
      registerHandler?: (handler: (data: unknown) => void) => void
    }) => void
  }

  type RequestParams<R, K extends keyof R> = R[K] extends {
    params: infer P
  }
    ? P
    : never
  type RequestResponse<R, K extends keyof R> = R[K] extends {
    response: infer V
  }
    ? V
    : void

  export type BunRPC<Schema extends ElectrobunRPCSchema> = RPCWithTransport & {
    send: {
      [K in keyof Schema['webview']['messages']]: (
        payload: Schema['webview']['messages'][K],
      ) => void
    }
  }

  export type WebviewRPC<Schema extends ElectrobunRPCSchema> = RPCWithTransport & {
    request: {
      [K in keyof Schema['bun']['requests']]: (
        params: RequestParams<Schema['bun']['requests'], K>,
      ) => Promise<RequestResponse<Schema['bun']['requests'], K>>
    }
  }

  export type RPCConfig<Schema extends ElectrobunRPCSchema, Side extends 'bun' | 'webview'> = {
    maxRequestTime?: number
    handlers: {
      requests?: Partial<{
        [K in keyof Schema[Side]['requests']]: (
          params: RequestParams<Schema[Side]['requests'], K>,
        ) =>
          | RequestResponse<Schema[Side]['requests'], K>
          | Promise<RequestResponse<Schema[Side]['requests'], K>>
      }>
      messages?: Partial<{
        [K in keyof Schema[Side]['messages']]: (payload: Schema[Side]['messages'][K]) => void
      }>
    }
  }

  export class BrowserView<Transport extends RPCWithTransport = RPCWithTransport> {
    static defineRPC<Schema extends ElectrobunRPCSchema>(
      config: RPCConfig<Schema, 'bun'>,
    ): BunRPC<Schema>
    rpc: Transport
    loadURL(url: string): void
    on(
      name: 'dom-ready' | 'will-navigate' | 'did-navigate' | 'new-window-open',
      handler: (event: unknown) => void,
    ): void
  }

  export class BrowserWindow<Transport extends RPCWithTransport = RPCWithTransport> {
    id: number
    webview: BrowserView<Transport>
    constructor(options: {
      title: string
      url: string
      frame: { width: number; height: number; x?: number; y?: number }
      rpc?: Transport
      sandbox?: boolean
      spellCheck?: boolean
      navigationRules?: string
    })
    activate(): void
    close(): void
    on(name: 'close' | 'resize' | 'move', handler: (event: unknown) => void): void
  }

  export type ApplicationMenuItem = {
    label?: string
    role?: string
    action?: string
    accelerator?: string
    enabled?: boolean
    type?: 'separator' | 'divider' | 'normal'
    submenu?: ApplicationMenuItem[]
  }

  export const ApplicationMenu: {
    setApplicationMenu(menu: ApplicationMenuItem[]): void
  }

  export const Updater: {
    localInfo: {
      channel(): Promise<string>
    }
  }

  export const Utils: {
    paths: { userData: string }
    openExternal(url: string): boolean
  }

  const Electrobun: {
    events: {
      on(name: 'application-menu-clicked', handler: (event: unknown) => void): void
    }
  }

  export default Electrobun
}

declare module 'electrobun/view' {
  import type { ElectrobunRPCSchema, RPCConfig, WebviewRPC } from 'electrobun/main'

  export class Electroview<Schema extends ElectrobunRPCSchema> {
    constructor(options: { rpc: WebviewRPC<Schema> })
    static defineRPC<Schema extends ElectrobunRPCSchema>(
      config: RPCConfig<Schema, 'webview'>,
    ): WebviewRPC<Schema>
  }

  const Electrobun: {
    Electroview: typeof Electroview
  }

  export default Electrobun
}
