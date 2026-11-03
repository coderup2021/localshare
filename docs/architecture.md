# LocalShare 一期架构

状态：草案（2026-11-03）
范围：`server`、`user-web`、`admin-web`、Electrobun `desktop`

## 1. 目标与成功条件

LocalShare 部署在局域网中的一台主机上，为局域网用户提供本地化的信息分享和聊天能力。一期不依赖公网云服务，桌面端和移动端只作为后续兼容目标。

一期达到以下结果即可视为产品纵切完成：

- 普通用户无需注册或登录，直接进入唯一的 public 频道。
- 所有访问者在同一个 public 频道中发送文本、图片、视频及普通文件，消息默认对所有人可见。
- 消息实时到达在线访问者；刷新页面和断线重连后能恢复历史并补齐遗漏事件。
- 管理员使用唯一账户 `localShare` 登录 admin-web，支持注销和修改密码。
- 管理员能删除违规消息、查看存储概况与审计记录。
- 服务端能在一台主机上完成数据库迁移、附件落盘、静态资源托管、备份和恢复。
- backend 发布物能以单个 npm 包安装；第三方用户通过 CLI 启动、停止、重启服务，并在首次启动时指定数据目录和 IPv4 监听地址。
- 桌面客户端能在同一 IPv4 广播域自动发现服务器，选定后加载该服务器的 user-web；无法广播时允许手动地址连接。

## 2. 系统边界

```text
局域网浏览器
  │
  └─ Web 入口 :8888（生产）/ :7777（开发）
       ├─ /        → user-web 构建产物
       ├─ /admin/   → admin-web 构建产物
       └─ /api/*、/ws
              │ 反向代理
              ▼
         Bun + Hono :8887（生产）/ :5678（开发）
          ┌──────┴──────┐
          │             │
       SQLite       附件目录
   metadata/state    文件内容
```

部署拓扑采用单节点：

- 生产环境一个 Bun 服务进程同时持有 `8887` API/WebSocket listener 和 `8888` Web/静态资源入口 listener。
- 一个 SQLite 数据库文件。
- 一个受控的本地附件目录。
- `8888` listener 承担静态资源和浏览器侧 `/api`、`/ws` 路由职责；TLS 终结层可以放在该入口之前，开启 HTTPS 后管理员 Cookie 启用 Secure。

`8887` 是生产 API 真实端口，`8888` 是浏览器唯一入口。浏览器请求 `/api/*` 和 `/ws` 时由 `8888` listener 路由到同一进程的 API 应用，因此浏览器侧保持同源，管理端 Cookie 不跨域。开发环境继续使用 `5678/7777`。

不在一期引入 Redis、消息队列、对象存储、SSR、微服务或独立业务实时网关。

## 3. 技术结构

### 3.1 Workspace

建议使用 Bun workspaces，在根目录统一安装依赖和运行质量检查：

```text
backend/
  server/                 # Node/Bun 服务，不依赖浏览器环境
  web-user/               # 用户 SPA
  web-admin/              # 管理 SPA
app-desktop/              # Electrobun 桌面壳、本地发现页和远端 user-web
packages/
  contracts/              # Zod API schema、错误码、跨端 DTO
  config/                 # 可选的共享 TS/ESLint 配置
docs/
```

`packages/contracts` 在 M0/M1 真正需要共享 schema 时创建；如果初期只有一个消费方，不要为了目录整齐制造空包。

### 3.2 开发与生产

开发期：

- 开发 server 固定监听 `5678`，生产 server 固定监听 `8887`。
- user-web 和 admin-web 分别构建，Vite 可运行在内部端口。
- 根开发脚本在 `7777` 启动统一开发入口，将 `/` 转发给 user-web、`/admin/` 转发给 admin-web。
- 统一入口把 `/api` 和 `/ws` 转发到 `5678`，避免开发环境跨域和管理员 Cookie 差异。

生产期：

- Hono 在生产 `8887` 暴露 `/api/*`、`/ws`，不要求直接向浏览器开放。
- 生产端口 `8888` 的静态资源服务托管 user-web 和 admin-web 构建产物，并处理 API/WebSocket 路由。
- user-web 使用 `/`，admin-web 使用 `/admin/`，两者共享 `8888` 入口。
- SPA 路由 fallback 不得吞掉 `/api` 和 `/ws`。
- 附件使用独立的受控下载路由，不直接暴露磁盘目录。
- npm 发布版把 API 监听、Web 入口和 CLI 进程管理收进同一个发行包；生产服务进程同时持有 `8887` 和 `8888` 两个 listener。

## 4. 身份与会话

### 4.1 普通用户

user-web 不做登录、注册和账户管理。所有打开 user-web 的访问者都能读取和发送 public 消息。

聊天仍需区分发送者和保存已读位置，因此服务端在首次访问时签发匿名访客 Cookie：

- Cookie 中保存不可预测的匿名访客 ID。
- 该 Cookie 只用于身份展示、限流和已读位置，不是登录态，不授予管理能力。
- 清除 Cookie 或更换浏览器会得到新的匿名身份；一期不承诺跨设备身份延续。
- 默认展示名建议自动生成为“访客-短标识”。是否允许访客自定义昵称是 M2 的产品细化项。

### 4.2 唯一管理员

- 唯一用户名固定为 `localShare`。
- 初始密码为 `12345678`；管理员登录后可以修改密码。
- `localShare` 拥有一期全部管理权限，一期不创建其他管理员、角色或权限矩阵。
- 密码使用 Bun 提供的强哈希能力，数据库不保存明文。
- 初始管理员在数据库为空时初始化；默认密码只用于首次登录，之后应立即修改。
- 登录后签发不可预测的随机会话令牌，令牌通过 `HttpOnly`、`SameSite` Cookie 返回。
- 数据库保存管理员会话令牌哈希、创建时间、最后使用时间、过期时间和撤销时间。
- 修改密码后撤销该管理员的其他会话；一期不实现多账户、角色或权限矩阵。

### 4.3 管理员接口草案

| 方法    | 路径                          | 说明                                    |
| ------- | ----------------------------- | --------------------------------------- |
| `POST`  | `/api/v1/admin/auth/login`    | 使用 `localShare` 登录并设置会话 Cookie |
| `POST`  | `/api/v1/admin/auth/logout`   | 注销当前管理员会话                      |
| `GET`   | `/api/v1/admin/auth/me`       | 当前管理员身份                          |
| `PATCH` | `/api/v1/admin/auth/password` | 修改密码并撤销其他会话                  |

## 5. 会话与消息

### 5.1 会话范围

一期只有一个 `public` 会话：

- 首次启动时由 migration/seed 创建唯一 public 会话。
- 所有 user-web 访问者自动可见该频道，无需加入，也不创建成员记录。
- 所有普通用户和 admin-web 读取到的是同一份公开消息流。
- 一期不提供私聊、群聊、用户目录、成员列表、邀请或会话切换 API。
- 若未来增加 direct/group，再新增成员关系与会话授权；一期不提前实现。

### 5.2 匿名访客初始化

建议在首次访问时通过轻量接口建立匿名身份：

| 方法     | 路径                              | 说明                                                        |
| -------- | --------------------------------- | ----------------------------------------------------------- |
| `GET`    | `/api/v1/public/bootstrap`        | 设置匿名访客 Cookie，返回频道信息、当前访客短标识和初始游标 |
| `GET`    | `/api/v1/public/messages?cursor=` | 游标分页读取 public 历史                                    |
| `GET`    | `/api/v1/public/search/messages`  | 在服务端搜索消息正文和附件文件名                            |
| `POST`   | `/api/v1/public/messages`         | 幂等发送 public 消息                                        |
| `DELETE` | `/api/v1/public/messages/:id`     | 匿名访客撤回自己发送的消息                                  |
| `POST`   | `/api/v1/public/read`             | 更新当前匿名访客的已读位置                                  |

匿名访客 Cookie 不是管理员认证 Cookie，两者名称、签名/校验和权限必须完全分开。

### 5.3 消息写入

消息的权威路径：

1. 客户端上传附件（如有），获得 `attachmentId`。
2. 客户端调用 HTTP 发送消息，携带消息类型、正文/附件引用和幂等键。
3. 服务端确认目标为唯一 public 频道并校验输入，在事务中写入消息，返回权威消息对象。
4. 服务端向所有在线 WebSocket 连接广播 `message.created`。
5. 客户端用 HTTP 响应或 WebSocket 事件合并同一消息，按服务端 ID 去重。

这个路径让超时重试、网络断开和 WebSocket 短暂不可用都不会产生重复或丢失消息。WebSocket 不作为唯一发送入口。

撤回同样通过 HTTP 写入。服务端只允许匿名访客撤回 `senderId` 与当前访客 Cookie 一致的消息，写入 `recalledAt` 后广播 `message.recalled`；历史接口继续返回有序的撤回占位消息，但不再返回原文字或附件。

消息搜索必须由服务端数据库执行，覆盖消息正文、图片/视频文件名和普通文件名，并排除已撤回或已删除消息。客户端等待输入停止 500ms 后请求 `/api/v1/public/search/messages`，结果以独立下拉列表展示，不直接改写聊天消息流。

消息内容类型建议：

- `text`
- `image`
- `video`
- `file`
- `system`

附件消息保存附件元数据；正文和附件可以同时存在，但每种类型的必填字段由统一 Zod discriminant schema 定义。

### 5.4 顺序、分页与幂等

- 每条消息由服务端生成全局唯一 ID 和全局递增序号，递增序号用于 public 消息流稳定排序。
- 历史接口使用 `seq` 作为游标，不用 offset。
- 客户端为每次发送生成幂等键；服务端在 `(visitorId, clientRequestId)` 上保证唯一。
- 重试同一幂等键返回第一次成功写入的权威消息，不再次广播。
- 已读状态按“匿名访客 + 最后已读 seq”记录，避免逐消息写已读行。

## 6. WebSocket 协议

连接地址：`/ws`，生产环境由 `8888` Web 入口路由到 `8887` API 应用。普通用户无需登录即可连接；若请求携带有效管理员会话 Cookie，则连接被标记为管理员连接，否则一律按匿名访客处理。

统一 envelope：

```json
{
  "type": "message.created",
  "eventId": "evt_...",
  "occurredAt": "2026-11-02T01:30:00.000Z",
  "payload": {}
}
```

一期事件：

- `ready`：连接建立成功，返回访客/管理员身份、心跳参数和当前最新 seq。
- `message.created`
- `message.recalled`：发送者撤回消息后广播，payload 为隐藏原文和附件后的消息占位对象。
- `message.deleted`：管理员软删除消息后广播。
- `read.updated`：可选的已读位置变化统计。
- `admin.session.revoked`：仅发送给对应的管理员连接。
- `error`

客户端可在连接后发送：

- `ping`

服务端规则：

- 所有 WebSocket 连接只接收唯一 public 频道事件；不存在私聊订阅。
- 管理员专属事件不得广播给匿名连接。
- 心跳清理半开连接。
- 客户端断线后先通过 HTTP 拉取最后已知 seq 之后的数据，再恢复实时监听。
- 事件必须有服务端 `eventId`；客户端至少实现幂等合并。

## 7. 附件

推荐两阶段模型：

1. `POST /api/v1/uploads`：以 multipart 上传文件，服务端流式写入临时文件，校验后落盘并创建附件记录。
2. `POST /api/v1/public/messages`：消息引用附件 ID，服务端验证附件属于当前匿名访客且未被其他消息占用。

存储字段至少包括：

- `id`、`uploaderType`、`uploaderId`
- `storageKey`、`originalName`
- `mimeType`、`sizeBytes`、`sha256`
- `kind`（image/video/file）
- `status`（pending/ready/attached/deleted）
- `createdAt`、`deletedAt`

实现要求：

- 限制单文件大小、视频大小和请求频率，限制值来自环境配置。
- MIME 与扩展名只作为初筛；危险类型强制下载。
- 存储键由服务端生成，磁盘路径必须解析后留在附件根目录内。
- 已关联且未撤回、未删除的 public 消息附件对所有人可下载；撤回或删除后下载接口返回不存在。
- 下载接口不能允许通过客户端文件名或任意路径直接读取磁盘。
- 视频和音频支持 HTTP `Range`，便于浏览器拖动播放。
- 孤立附件有清理策略；被删除消息引用的附件是否立即删除需单独决策。

## 8. 数据库草案

核心表：

- `admin_account`：唯一管理员，逻辑上只允许一行
- `admin_sessions`
- `anonymous_visitors`
- `conversations`
- `messages`
- `message_sequence` 或等价会话序号计数
- `read_positions`
- `attachments`
- `audit_logs`
- `settings`

关键约束：

- `admin_account.username = 'localShare'`，唯一且不可通过普通 API 改用户名。
- `conversations.type = 'public'`，一期只存在一行 public 记录。
- 消息保存 `sender_type`（visitor/admin）、`sender_id` 和发送时的 `sender_name_snapshot`。
- 消息通过 `recalled_at` 保存用户撤回时间；撤回是软状态，不破坏 seq、分页或幂等键。
- 消息幂等键按发送者唯一，匿名访客和 admin 使用各自身份空间。
- 所有外键声明并启用 SQLite `foreign_keys`。
- 启用 WAL、合理的 `busy_timeout`，所有多表写入使用事务。
- 常用索引覆盖：消息 `(conversation_id, seq)`、访客最近活跃时间、附件状态和消息时间排序。
- 删除消息优先做软删除；硬删除和附件回收由后台任务执行。

具体 schema 在 M1 通过 Drizzle 定义，并以 migration 作为最终真相。

## 9. 错误、日志与可观测性

稳定错误 envelope 建议：

```json
{
  "error": {
    "code": "ADMIN_UNAUTHORIZED",
    "message": "Administrator login is required",
    "requestId": "req_..."
  }
}
```

- HTTP 状态码表达协议语义，`code` 供客户端分支处理。
- 前端不根据人类可读消息判断错误类型。
- 每个 HTTP 请求和 WebSocket 事件带关联 ID。
- 使用结构化日志记录方法、路径、耗时、状态、匿名访客 ID 或管理员 ID，不记录敏感载荷。
- 健康检查区分存活和就绪；就绪检查至少验证数据库可读。
- 管理后台首版展示消息数、附件数、存储占用、在线连接数和管理员会话状态；不做完整监控平台。

## 10. 管理后台边界

一期管理功能：

- `localShare` 登录、注销和修改密码。
- public 消息浏览、检索和软删除。
- 附件占用与孤立附件查看。
- 系统设置：上传大小限制等可安全动态调整的项。
- 审计日志。

高风险操作二次确认并记录审计日志。管理员不能通过客户端绕过服务端规则。一期不存在其他账户、角色、禁用用户、重置他人密码或权限分配功能。

## 11. 备份、恢复与部署

- SQLite 数据库和附件目录必须一起备份，不能只备份数据库。
- 备份前使用 SQLite 在线备份能力或安全快照，避免复制正在写入的 WAL。
- 恢复流程需要在测试环境演练，并验证消息、附件、匿名访客标识和管理员登录。
- 服务进程由 npm CLI 管理启动、停止和重启；一期只保证单实例。可以选择外层 systemd/容器托管，但不能再启动第二个 CLI 实例。
- 首次启动的数据目录和 IPv4 监听地址由 CLI 参数提供；之后 `stop`/`restart` 读取已保存的活动实例配置。
- 运维配置优先由 CLI 持久化，环境变量只用于开发和容器内部覆盖；仓库只提交 `.env.example`。
- 生产 `8888` 的 Web 入口对浏览器提供静态资源并处理 `/api`、`/ws` 到生产 `8887` API。
- 反向代理设置合理的上传体积和 WebSocket upgrade 超时，并对 SPA fallback 排除 API/WS 路径。
- 数据库、附件、日志、PID/锁文件和实例配置全部位于数据目录，不能位于 npm 全局安装目录。

## 12. 安全与隐私

LocalShare 的数据默认留在局域网主机，但“局域网”不是免鉴权理由。

- 全站输入校验、上传限制和匿名流量限流必须存在；所有管理接口都验证管理员会话。
- 管理员登录、上传、消息发送和管理操作限流。
- 支持 TLS 时启用 Secure Cookie；纯 HTTP 局域网部署要明确告知安全限制。
- 管理员和普通用户界面分离；admin-web 前端路由保护不能替代管理 API 的服务端会话校验。
- 匿名访客 Cookie 只用于身份关联，绝不能作为管理员认证依据。
- 不允许上传可执行脚本后在同源下直接渲染。
- 删除消息时确定附件、审计记录的保留策略，不能产生悬空外键。
- 导出的日志、备份和测试 fixture 不得包含真实密码或私人文件。
- CLI 在管理员仍使用默认密码时，每次成功启动都可显示用户名和默认密码；普通运行日志和状态接口不得记录密码。密码修改后不得展示旧密码。

## 13. 后续客户端兼容点

桌面客户端已使用 Electrobun 2.0.5 实现，移动客户端仍暂不开发。契约继续支持：

- REST API 版本前缀。
- 管理员 Cookie 会话与未来可能签发的 Bearer 令牌解耦。
- 稳定的消息游标和 WebSocket 补洞协议。
- 附件通过服务端 URL 而非本地文件路径引用。
- 客户端能力字段和 API 版本协商。

桌面端不在本地复制聊天 UI：本地 React 视图只负责服务器发现和连接，聊天页使用沙箱 WebView 直接加载服务器现有 user-web。该方案保持 Cookie、WebSocket 和附件下载与服务端同源，也不为桌面端维护第二套业务前端。

## 14. NPM 发布与 CLI 生命周期

### 14.1 发布物

最终发布主包名为 `localshare-server`，必须能通过 `npm pack` 和 `npm publish` 发布到 npm 仓库，并允许第三方全局安装：

```bash
npm install -g localshare-server
localshare --version
```

发布包至少包含：

- 服务端运行代码和 WebSocket/HTTP 路由。
- Drizzle migration 与启动迁移执行器。
- 构建后的 user-web 和 admin-web 静态资源。
- `localshare` CLI 及其可执行入口。
- 默认公开配置、许可证和最小 README。

开发仓库中的 TypeScript 源码、测试、`.env`、数据库、上传文件和日志不得打进发布包。

发布方案采用 `bun build --compile` 生成各平台独立二进制，并通过 npm 平台 `optionalDependencies` 分发。当前矩阵为 Linux x64/arm64、Windows x64、macOS x64/arm64。上层 npm 包提供 Node 兼容的 `localshare` 启动器，根据 `process.platform` 和 `process.arch` 选择包及二进制名称；Windows 平台包使用 `.exe`。用户安装 npm 包后不需要额外安装 Bun。暂时不支持的平台必须在安装或首次执行时明确报错，不能静默安装后启动失败。

平台包通过 Bun `--target` 从构建机交叉编译；发布前至少检查 ELF、PE32+ 和 Mach-O 架构。CLI 为每次启动生成独立控制令牌并写入权限受限的实例文件，`stop`/`restart` 优先调用本机控制端点完成跨平台优雅关闭；端点不可用时再回退到 `SIGTERM`/`SIGKILL`，Windows 超时后以 `taskkill /T /F` 清理进程树。进程归属判断分别使用 `/proc`、`ps` 和 `tasklist`，不得仅凭 PID 存活就停止进程。

### 14.2 数据目录

首次启动会交互询问数据目录，默认是用户家目录下的 `.localshare`，也可通过 `--data-dir` 直接指定：

```text
<data-dir>/
  localshare.sqlite
  uploads/
  logs/
  run/
    localshare.pid
    localshare.lock
  instance.json
  server-identity.json
```

- `instance.json` 保存活动实例的数据目录、IPv4、版本、启动时间以及仅用于本机生命周期控制的随机令牌；该文件按私有权限写入，不保存管理员密码或管理员会话令牌。控制端点只接受精确令牌，令牌缺失或不匹配时返回 403。
- `server-identity.json` 保存首次启动生成的稳定随机 `serverId`，只用于 UDP 发现去重和服务器重连。
- 用户级 CLI 配置只保存“当前活动实例”的指针，使后续 `stop`/`restart` 能找到数据目录。
- 数据目录在首次启动时创建并校验可读写；已有数据目录不能被安装或升级清空。
- `npm install -g` 只写全局包目录；安装过程不得启动服务、初始化数据库或写用户数据。

### 14.3 CLI 命令

| 命令                                                | 行为                                                            |
| --------------------------------------------------- | --------------------------------------------------------------- |
| `localshare start [--data-dir <dir>] [--ip <IPv4>]` | 首次交互配置，后续复用上次配置；执行初始化、后台启动和健康检查  |
| `localshare stop`                                   | 对当前活动实例发送优雅停止信号，必要时等待超时后清理失效 PID/锁 |
| `localshare restart`                                | 停止当前实例后使用已保存的数据目录和 IPv4 启动                  |
| `localshare status`                                 | 显示运行状态、PID、版本、数据目录、IPv4、端口和访问地址         |
| `localshare logs`                                   | 查看服务日志位置及最近日志，具体参数在 M6 定义                  |

首批必须实现 `start`、`stop`、`restart`，`status` 用来给用户和自动化提供可验证状态；`logs` 是推荐项。

`start` 的规则：

- `--data-dir` 和 `--ip` 都可省略；首次启动依次提示，数据目录默认 `~/.localshare`，IP 默认 `0.0.0.0`。
- `0.0.0.0` 表示监听所有 IPv4 网卡；具体 IPv4 必须是本机已绑定地址。拒绝主机名、IPv6 和组播地址。
- 非首次 `start` 直接复用上次配置；`restart --reset` 可停止服务并重新进入交互配置。
- 两个生产服务端口都绑定指定 IPv4：API/WS 为 `8887`，Web 入口为 `8888`。
- 启动前检查端口占用、数据目录权限、SQLite 文件可打开和 migration 状态。
- 已有实例正在运行时，不启动第二个实例；提示使用 `restart` 或 `status`。
- 子进程成功绑定端口并通过 `/api/v1/health/ready` 后才判定启动成功；启动失败时返回非零退出码并保留可诊断日志。

### 14.4 启动成功输出

每次成功启动且管理员仍使用初始密码时，终端必须输出可直接访问的地址和凭据：

```text
LocalShare started
Web:   http://192.168.1.10:8888/
Admin: http://192.168.1.10:8888/admin/
API:   http://192.168.1.10:8887/api/v1
Admin username: localShare
Admin password: 12345678
Change the default password after first login.
```

启动成功后，用户应能直接打开 Web 地址并发送消息。管理员密码修改后，后续启动只显示 URL 和用户名，密码显示为 `customized (not displayed)` 或等价文案。

### 14.5 发布验收

- 在干净环境执行 `npm pack`，检查 tarball 只含运行所需文件。
- 从 tarball 全局安装，安装过程不启动服务、不创建业务数据。
- 使用全新数据目录和本机 IPv4 执行 `start`，终端输出正确 URL、默认用户名和密码。
- 浏览器打开 Web 地址可发送消息；管理地址可登录；API/WS 端口均只绑定指定 IPv4。
- `stop` 后进程退出、端口关闭；`restart` 后历史消息和已修改密码保留。
- 在服务停止时升级 npm 包，再启动同一数据目录，migration 成功且数据不丢失。
- 启动失败、端口冲突、非法 IPv4、不可写目录均返回非零退出码和可操作错误信息。

## 15. 桌面端与 UDP 自动发现

桌面端启动时优先检查已保存服务器；失效或首次运行时打开本地服务器选择页。只发现一个服务器时，稳定观察到 2 秒后自动进入；多个服务器显示列表。用户可通过原生菜单切换服务器，也可输入根地址手动连接。

发现协议固定使用 IPv4 UDP 端口 `49777`，由共享 Zod 契约维护：

```json
{
  "protocol": "localshare-discovery",
  "version": 1,
  "type": "query",
  "requestId": "uuid",
  "client": "desktop",
  "clientVersion": "0.1.0"
}
```

服务端收到合法查询后单播响应，包含 `serverId`、`serverName`、`serverVersion`、`webPort`、能力列表和 `issuedAt`。客户端使用 UDP 包的来源 IPv4 与 `webPort` 构造 URL，不接受报文声明的其他主机地址。报文最大 1024 字节，服务端按来源限速。

桌面客户端枚举每个非回环 IPv4 网卡并发送定向广播，同时探测回环地址供本机测试。结果按 `serverId` 去重，10 秒未刷新即移除。默认只接受私有、链路本地和回环来源。

广播不跨越路由器、VLAN 或启用了客户端隔离的无线网络。严格防火墙可能阻断 UDP `49777`，此时手动地址始终可用。旧版服务器没有发现响应，也可通过手动地址连接。

聊天窗口必须启用 Electrobun sandbox，不配置 preload 或 RPC，并将导航限制在所选服务器源。跨源链接交给系统浏览器。服务器发现页与远端聊天页使用独立窗口，服务器内容不能获得本地主进程 RPC。
