# AGENTS.md — LocalShare

本文件是编码智能体进入仓库的入口，不是完整设计文档。开始任务前先读本文件，再按文档索引读取与任务相关的文档。实现发生变化时，同步更新受影响的文档；不要留下与代码不一致的约定。

## 项目目标

LocalShare 是运行在本地局域网内的信息分享与即时通信软件。用户可以像使用微信聊天一样发送文本、图片、视频和文件。

产品端规划：

- 第一期：`server`、`user-web`、`admin-web`
- 当前桌面端：`app-desktop`
- 后续：`app-mobile`

M0 工程基础、管理员认证、public 实时文本和附件纵切已完成（2026-11-02）：普通访问者可自动获得匿名访客身份，在唯一公共频道发送文本、图片、视频和文件；开发环境通过 `7777`、生产环境通过 `8888` 访问 Web。新消息通过 WebSocket 实时广播，客户端断线后自动重连并用 HTTP 历史补齐。附件元数据保存在 SQLite，文件内容保存在数据目录。管理员可用 `localShare` 登录、保持会话、退出和修改密码。Electrobun 桌面端和 IPv4 UDP 自动发现已加入工作区（2026-11-03）：桌面端本地显示服务器选择页，选定服务器后以沙箱 WebView 加载该服务器的 user-web。npm 发布候选支持 Linux x64/arm64、Windows x64、macOS x64/arm64，并通过命令行管理服务生命周期。

## 当前目录

| 路径                | 用途                                                        | 当前状态                                   |
| ------------------- | ----------------------------------------------------------- | ------------------------------------------ |
| `backend/server`    | Bun + Hono 服务、SQLite/Drizzle、CLI；最终打包为 npm 发布物 | 认证、实时消息和附件服务可运行             |
| `backend/web-user`  | 用户 Web 客户端                                             | 实时文本、图片、视频、文件和重连可运行     |
| `backend/web-admin` | 管理 Web 客户端                                             | 登录、会话保持、退出和改密界面可运行       |
| `app-desktop`       | Electrobun 桌面客户端                                       | 自动发现、选择器和远端 user-web 沙箱加载   |
| `app-mobile`        | 移动客户端                                                  | 暂不开发                                   |
| `assets/brand`      | Web 与桌面端品牌图标矢量源                                  | LocalShare 品牌图标单一来源                |
| `.codegraph/`       | CodeGraph 本地代码索引，不提交、不发布                      | 已初始化；CLI 当前不可用，待安装后重新同步 |
| `docs/`             | 架构、协议、路线图和决策记录                                | 初始化中                                   |

目录名是当前实际状态。若要调整工作区布局或重命名目录，必须先作为独立改动完成，并同步所有脚本和文档。

## 技术栈与边界

- 运行时和包管理：Bun；使用 Bun workspaces 组织一期三个应用。
- 服务端：Bun、Hono、`Bun.serve`/WebSocket、SQLite、Drizzle ORM、Drizzle Kit。
- 用户 Web：React + TypeScript + Vite、shadcn/ui、Tailwind CSS v4、Zustand、Zod、Axios。
- 管理 Web：React + TypeScript + Vite、Ant Design、Zustand、Zod、Axios。
- 目标语言：TypeScript strict mode。跨端数据契约优先由 Zod schema 推导，禁止用未校验的 `any` 作为接口边界。

一期采用单节点部署：一个 Bun 服务进程、一份 SQLite 数据库、一个本地附件目录。不要为假设中的多节点或云部署提前引入队列、对象存储或微服务。

固定端口约定：

- 开发环境 HTTP API/WebSocket 使用 `5678`，统一 Web 入口使用 `7777`。
- 生产环境 HTTP API/WebSocket 使用 `8887`，统一 Web 入口使用 `8888`。
- IPv4 UDP 自动发现默认使用 `49777`，可由 `LOCALSHARE_DISCOVERY_PORT` 覆盖。
- user-web 使用 `/`，admin-web 使用 `/admin/`。两个应用通过同一个 Web 入口访问，不分别占用对外端口。
- 开发期内部 Vite 端口可以不同，但必须由根脚本通过 `7777` 统一代理；生产期由端口 `8888` 上的静态资源服务统一暴露，并将 `/api`、`/ws` 路由到同一服务进程的 `8887` API listener。
- npm 发布版首次 `start` 通过交互方式依次询问数据目录和监听 IPv4；默认分别为用户家目录下的 `.localshare` 和 `0.0.0.0`。后续启动复用保存的配置，`--reset` 可重新配置。

最终 npm 使用形态（包名在发布前确认）：

```bash
npm install -g localshare-server
localshare start
localshare stop
localshare restart
localshare status
```

自动化和服务部署也可以直接传参：

```bash
localshare start --data-dir /srv/localshare --ip 0.0.0.0
localshare restart --reset
```

`start` 在后台启动服务，等待健康检查成功后打印 Web、管理端和 API 地址。管理员仍使用默认密码时，同时显示用户名和默认密码；密码已修改后只显示用户名。`stop`、`restart` 使用已保存的活动实例信息；数据目录、日志、PID 或锁文件不得写入全局 npm 安装目录。

## 文档索引

| 文档                                                   | 内容                                                            |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| [`docs/architecture.md`](docs/architecture.md)         | 一期系统边界、模块、数据模型、HTTP/WebSocket/附件方案与安全基线 |
| [`docs/development-plan.md`](docs/development-plan.md) | 里程碑、执行顺序、验收标准、当前步骤和待决策项                  |

## CodeGraph 强制工作流

本仓库使用 [CodeGraph](https://github.com/colbymchenry/codegraph) 维护本地代码图谱。图谱用于快速定位符号、调用路径、依赖关系和修改影响面；源码、类型检查和测试仍然是最终事实来源。

首次初始化：

```bash
codegraph init .
codegraph status .
```

`codegraph init` 应在仓库根目录执行一次，生成不提交到 Git 的 `.codegraph/` 索引。CodeGraph 默认带自动监听同步，但本仓库仍要求每次代码修改完成后执行显式同步，避免守护进程未运行、沙箱无监听或刚完成的改动尚未进入图谱。

当前仓库已完成首次源码索引。后续代码修改只需增量 `sync`；若索引损坏或跨大版本升级，再执行完整 `index` 重建。

修改前优先查询：

```bash
codegraph explore "public 消息发送链路"
codegraph context "实现管理员修改密码并撤销旧会话"
codegraph impact "<symbol>"
codegraph affected "<changed-file>"
```

使用规则：

1. 修改已有代码前，先用 `explore`、`context`、`query`、`node` 或 `callers`/`callees` 定位相关链路；不要只凭文件名猜实现。
2. 修改公共符号、共享契约、路由或数据库 schema 前，用 `impact` 查看影响面；根据 `affected` 结果选择测试。
3. 每次完成代码修改、格式化及机械性改写后，在仓库根目录执行：

   ```bash
   codegraph sync .
   codegraph status .
   ```

4. `status` 不得显示待同步文件、索引错误或未初始化状态。若增量同步异常，先排查监听/锁和错误输出；必要时再执行完整的 `codegraph index .`。
5. 若后续又修改了代码，必须再次执行 `sync` 和 `status`；不能以较早一次成功结果代表最终工作区状态。
6. 纯 Markdown 文档修改不强制重建图谱；只要代码、配置、schema、migration 或会影响代码结构的生成文件发生变化，就适用本流程。
7. `.codegraph/` 是开发者本地索引，不提交 Git，也不进入 npm 发布包。

CodeGraph 查询失败或索引暂时不可用时，应明确记录原因并采用常规代码检索继续任务；不得声称已检查图谱但没有执行命令。

文档优先级：

1. 用户在当前任务中的明确要求。
2. 本文件中的硬约束。
3. 架构与路线图。
4. 既有代码和测试。

若代码与文档冲突，先停止扩散冲突，判断哪一方代表最新意图；修复后在文档中记录，不要默默接受偏差。

## 开发前置检查

开始任何实现任务时：

1. 阅读本文件和路线图的“当前步骤”，确认任务属于当前里程碑。
2. 检查工作区状态和相关文件；不要覆盖或回滚不属于当前任务的改动。
3. 已有代码时，先确认 CodeGraph 已初始化，并用图谱查询相关符号与调用链。
4. 先明确本次要改的用户行为、API 契约、数据库变更和验收方式。
5. 先定义共享契约或 Drizzle schema，再实现服务端，最后接入 Web 客户端。
6. 完成代码修改后执行 `codegraph sync .` 和 `codegraph status .`，再运行与风险匹配的检查；只要涉及可运行代码或用户界面，还必须执行真实浏览器 E2E，最后更新路线图状态或决策记录。

根目录脚本现已可用；`pack:server` 生成主包及 Linux x64/arm64、Windows x64、macOS x64/arm64 平台包 tarball：

```bash
bun install
bun run dev            # API/WS: 5678；统一 Web 入口: 7777
bun run check          # typecheck + lint + test + build
bun run db:generate    # 生成 Drizzle migration
bun run db:migrate     # 应用 migration
bun run pack:server    # 构建并生成可检查的 npm tarball
bun run install:local  # 构建并安装到隔离的临时 npm 全局目录
bun run verify:local   # 验证本机 npm 安装、生命周期和真实关闭端点
bun run publish:npm    # 交互选择版本（默认 patch+1），再将包暂存到 npm stage
bun run brand:generate # 从 SVG 主文件同步 Web favicon 和桌面端平台图标
bun run dev:desktop    # 启动 Electrobun 桌面客户端
bun run build:desktop  # 构建当前平台的未签名开发安装包
bun run build:desktop:windows # 在 macOS 上组装 Windows x64 安装包
bun run test:desktop:e2e # 真实服务端 + Electrobun 原生发现冒烟
```

每个 workspace 的准确命令以其 `package.json` 为准；新增或改变脚本时同步本文件和 README。

## 架构硬约束

1. **服务端是唯一数据真相。** 客户端不得自行合成持久化消息 ID、匿名访客身份、权限或已读状态。
2. **写操作走 HTTP，实时分发走 WebSocket。** 文本和附件消息先由 HTTP 持久化并返回权威结果，再向相关连接广播；WebSocket 不承担唯一的持久化写入路径。
3. **所有外部输入在边界校验。** HTTP body/query/params、WebSocket 消息和 multipart 元数据都必须通过 Zod 或等价 schema 校验。
4. **数据库变更必须可追踪。** 只通过 Drizzle schema 和提交到仓库的 migration 修改数据库；禁止手工改生产数据库结构。
5. **附件只存元数据到 SQLite。** 文件内容写入配置的数据目录；数据库只保存归属、存储键、MIME、大小、哈希和生命周期状态。
6. **只有管理员需要鉴权。** user-web 不登录；所有管理接口都由服务端校验唯一管理员账户 `localShare` 的登录态。前端隐藏按钮不是权限控制。
7. **浏览器侧同源访问。** 开发 Web 入口为 `7777`、生产 Web 入口为 `8888`；浏览器统一通过 Web 入口访问 `/api` 和 `/ws`，避免 CORS 与 Cookie 差异。
8. **局域网不等于可信网络。** 仍然需要密码哈希、会话过期、输入校验、上传限制、速率限制和路径穿越防护。
9. **一期只有一个 public 频道。** 所有读取和发送者都可见同一频道；不实现私聊、群聊、成员关系或用户目录。匿名访客不能访问任何管理能力。
10. **桌面端复用远端 user-web。** 服务器选择页为本地 React 页面；连接后必须用 `sandbox: true`、无 preload、无 RPC 的 WebView 加载所选服务器，并限制导航到该服务器源。
11. **不要提前实现移动端。** 可以保持服务端和共享契约兼容，但不创建占位业务代码。
12. **数据目录与程序目录分离。** 数据库、附件、日志、运行状态和实例配置只能写入命令行指定的数据目录；npm 全局升级不得删除或覆盖用户数据。
13. **发布包必须自洽可安装。** 最终 npm 包必须包含服务端、迁移、user-web/admin-web 静态产物和 CLI，不能用“仓库内能跑”代替发布包验收。
14. **代码图谱必须保持最新。** 每次最终代码修改后都要显式同步 CodeGraph，并确认状态中没有待同步文件；图谱落后时不得宣称代码修改已完成。
15. **每次代码修改必须做 E2E。** 不能只以单元测试、类型检查、构建或 `curl` 代替真实浏览器验证。至少打开受影响的页面、等待数据加载完成、验证关键文案/状态和浏览器控制台无阻断错误；涉及交互时必须实际执行主要操作。

## 目录与代码组织

服务端按业务域而非技术层堆放：

```text
backend/server/src/
  app.ts                 # Hono 组装、全局中间件
  index.ts               # Bun 启动入口
  config/                # 环境配置
  db/                    # Drizzle schema、migration、连接
  cli/                   # start/stop/restart/status、参数校验、进程控制
  modules/
    admin-auth/
    public-chat/
    messages/
    uploads/
    admin/
  realtime/              # WebSocket 连接注册与事件分发
  shared/                # 服务端内部通用错误、日志、管理员认证上下文
```

每个业务域优先包含 `*.route.ts`、`*.service.ts`、`*.repository.ts`、`*.schema.ts` 和测试。路由层只做协议转换；业务规则在 service；数据库查询集中在 repository。小功能可合并 repository 到 service，但不要让路由直接散落业务 SQL。

用户 Web 和管理 Web 各自保持独立构建产物，但共享协议类型、错误码和领域数据形状。不要从 `web-user/src` 直接 import 到 `web-admin`，也不要把一个应用的组件复制为跨应用共享层。

## 数据、协议与时间

- 对外 ID 使用服务端生成的不透明字符串，客户端不得依赖其排序语义。
- 普通用户没有账号。服务端可签发匿名访客 Cookie 用于展示身份、限流和已读位置，但该 Cookie 不构成登录态，也不能访问管理接口。
- 管理员账户固定为 `localShare`。初始密码默认为 `12345678`，数据库只保存强哈希；首次修改密码后旧密码失效，并撤销该账户已有会话。
- 持久化时间统一使用 UTC Unix 毫秒整数；API 使用 ISO 8601 UTC 字符串或明确文档化的毫秒整数，同一字段只能选一种。
- 消息历史使用游标分页，禁止使用不断变化的 offset 分页。
- 每个可重试写请求应支持幂等键；至少覆盖消息发送。
- 错误响应使用稳定机器码和可本地化的人类消息，不能只返回自由文本。
- WebSocket 事件包含 `type`、`eventId`、`occurredAt` 和业务 payload；客户端处理断线重连后必须能通过 HTTP 补齐遗漏数据。
- 契约字段变更遵循兼容演进；删除或改变字段语义需要 migration 和版本说明。

## UI 与状态管理

- 用户 Web 以 shadcn/ui 组件和 Tailwind tokens 为基础；管理 Web 以 Ant Design 为基础。不要把两套视觉系统混在同一个应用里。
- Zustand 只保存客户端交互状态和 API 缓存，不保存应由服务端裁决的权限或消息真相。
- 表单校验使用 Zod；即时 UI 校验和服务端校验复用同一字段规则，但服务端始终重新校验。
- 所有 API 请求经统一 Axios 客户端进入，统一处理 base URL、错误映射、取消和鉴权失败。
- user-web 不包含登录、注册或会话恢复流程；admin-web 只实现 `localShare` 登录、注销和修改密码。
- 用户可见文案在实现 i18n 前可以先使用中文，但业务代码不得散落大量不可维护的文案；上线前集中到文案资源。
- 图片、视频和文件上传必须有进度、重试、取消或失败反馈；不提供无反馈的“点击后等待”。
- 桌面端聊天页面直接使用服务端 user-web；本地只维护发现、服务器选择和窗口生命周期。

## 安全基线

- 密码使用 Bun 提供的强密码哈希能力，不使用明文、MD5、SHA-1 或自创哈希。
- 管理员登录态使用 `HttpOnly`、`SameSite` Cookie；令牌不得写入 `localStorage` 或 URL。
- Cookie 鉴权的修改请求校验 `Origin`，并结合 SameSite 做 CSRF 防护。
- 管理员会话令牌只保存哈希；支持注销、过期、修改密码后立即失效。
- `localShare` 的默认密码只用于初始登录，不得写入普通运行日志、状态接口或业务 API。
- CLI 在管理员仍使用默认密码时，每次成功启动都可显示用户名和默认密码；密码修改后只显示用户名和“密码已自定义”，不得从哈希反推或展示旧密码。
- 上传限制扩展名、MIME、单文件和单次总量；文件名必须由服务端生成，禁止将客户端文件名直接拼接为磁盘路径。
- 附件下载要校验附件状态和所属 public 消息可见性；管理删除必须校验管理员会话，视频 Range 请求同样执行这些检查。
- 日志不得记录密码、完整会话令牌、上传内容或敏感 Cookie。
- 管理操作写审计日志，至少记录操作者、动作、目标、时间和结果。
- UDP 发现响应只返回服务标识、显示名、版本、Web 端口和能力；客户端以实际 UDP 来源 IPv4 构造地址，不信任报文声明的其他主机。

## 测试与完成标准

每个改动至少满足：

- TypeScript 类型检查通过。
- 新增业务逻辑有自动化测试；管理员认证、管理接口保护、分页、幂等和附件校验属于高风险逻辑，必须有测试。
- API 契约有成功、未认证管理请求、非法输入和不存在资源路径。
- WebSocket 行为覆盖公开连接、管理员连接、断线补齐和管理端事件隔离。
- 数据库变更能在空库和已有库上通过 migration。
- 代码修改后已执行 `codegraph sync .`，`codegraph status .` 无待同步文件或索引错误。
- 代码或用户界面修改后已执行 `bun run test:e2e`；E2E 必须使用真实浏览器访问最终开发/生产入口，并覆盖本次受影响流程。
- `bun run check` 通过。
- 涉及主要流程时，手工或 E2E 验证匿名用户直接进入 public 频道、发送文本、上传附件、刷新后历史仍在、断线重连可恢复，以及管理员登录、改密和内容删除。
- npm 发布候选包必须通过 `npm pack`、隔离环境全局安装、`start`/`stop`/`restart` 和浏览器发消息的冒烟测试。

功能未达到路线图定义的验收条件时，不勾选里程碑完成。

## 工作区与提交

- Git 仓库已初始化。提交前确认 `.gitignore` 覆盖 `node_modules`、构建产物、SQLite 文件、上传目录、日志、`.codegraph/` 和本地 `.env`。
- 使用小步、可审查的改动；不要把格式化、依赖升级和业务功能混在同一提交。
- 每完成一个可独立验收的功能就创建一次提交。只有针对当前 `HEAD` 同一功能的修复、测试补充或体验优化才使用 `git commit --amend`；开始新功能后必须创建新提交，不能覆盖上一功能提交。
- 不提交密钥、真实用户数据、数据库文件或测试上传文件。
- 不提交 `npm pack` 生成的 `.tgz`；发布物从干净构建产生，不手工拼装。
- 不提交 `.codegraph/` 本地索引目录。
- 提交信息建议：`feat: ...`、`fix: ...`、`docs: ...`、`test: ...`、`chore: ...`。
- 工作区可能同时存在他人改动。只修改当前任务相关文件，不做破坏性清理。

## 当前下一步

public 实时消息、附件、npm 发布候选、Electrobun 桌面端与 IPv4 UDP 自动发现已经完成。桌面端在 Linux x64、Windows x64、macOS x64 和 macOS arm64 使用未签名开发构建；Windows/macOS npm 原生安装冒烟和四目标桌面 E2E 已纳入 CI 矩阵，下一步确认首次远端运行结果并进入管理能力。

跨平台 npm 发布候选、生产 `8887/8888` 双端口服务和 `localshare` 生命周期 CLI 已实现。Linux x64 已在当前环境完成原生 npm 安装验证；Windows/macOS 已完成交叉编译和二进制格式检查，并加入原生安装与桌面 E2E 的 CI 矩阵。实际 npm registry 发布仍需要账号认证。

项目与 npm 发布物统一采用 `0BSD` 许可证，允许无条件使用、修改、分发和商业化。
