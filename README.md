# LocalShare

局域网内共享文本、图片、视频和文件的轻量服务。

一期包含：

- `backend/server`：Bun + Hono + SQLite + Drizzle API/WebSocket 服务
- `backend/web-user`：免登录公共频道
- `backend/web-admin`：管理员端
- `app-desktop`：Electrobun 桌面客户端，自动发现局域网服务器并复用 user-web

## 环境要求

- Bun 1.4.4+
- npm 11.21.1+（仅发布到 npm 时需要）
- CodeGraph 1.6+（代码图谱和影响分析）

## 本地开发

```bash
bun install
bun run dev
```

- user-web：<http://localhost:7777/>
- admin-web：<http://localhost:7777/admin/>
- API/WS：<http://localhost:5678/api/v1>

Web 入口使用 `7777`，避开 Chromium 对 `6665–6669` 的不安全端口限制。

公共频道允许所有能访问 `7777` 的局域网设备阅读和发送消息。

在线客户端通过 `/ws` 实时接收新消息；断线后自动重连，并通过 HTTP 游标历史补齐遗漏消息。

消息支持图片、视频和普通文件，单文件上限 100 MB；附件保存在数据目录的 `uploads/` 下。

服务端默认在 UDP `49777` 响应局域网发现查询。桌面客户端会枚举 IPv4 网卡并发送定向广播，选定服务器后直接打开该服务器的 user-web。跨 VLAN、访客网络隔离或严格防火墙环境可手动输入服务器地址。

首次运行前可从 `.env.example` 创建本地 `.env`。数据库和附件默认保存在仓库根目录
`.data/`，该目录不会提交。

## 生产安装与运行

发布候选主包为 `localshare-server`，npm 会按当前系统自动安装匹配的平台运行时：

- Linux x64 / arm64
- Windows x64
- macOS x64 / arm64（Apple Silicon）

终端用户只需安装 Node.js/npm，不需要另装 Bun：

```bash
npm install -g localshare-server
localshare start
localshare status
localshare restart
localshare stop
```

首次 `start` 会依次询问数据目录和监听 IPv4：

- 数据目录默认：用户家目录下的 `.localshare`
- 监听 IPv4 默认：`0.0.0.0`，即监听所有 IPv4 网卡

已有配置时再次 `start` 会直接复用上次配置。需要重新配置：

```bash
localshare restart --reset
```

自动化场景可一次性传参：

```bash
localshare start --data-dir /srv/localshare --ip 0.0.0.0
```

生产端口固定为 Web `8888`、API/WebSocket `8887`：

- user-web：`http://<host>:8888/`
- admin-web：`http://<host>:8888/admin/`
- API/WS：`http://<host>:8887/`

绑定 `0.0.0.0` 时，CLI 会输出本机可用的局域网 IPv4 地址。

首次启动会输出默认管理员 `localShare` 和密码 `12345678`；修改密码后，
后续启动只显示用户名和“密码已自定义”。

生成可安装 tarball：

```bash
bun run pack:server
```

本地构建并安装到隔离的临时 npm 全局目录：

```bash
bun run install:local
```

命令完成后可通过固定的最新安装入口运行：

```bash
/tmp/localshare-local-current/bin/localshare start
```

发布到官方 npm registry：

```bash
bun run publish:npm
```

命令从本地 `.env.publish` 读取 `NPM_ACCESS_TOKEN`，不提示 OTP，并按平台包、
主包顺序执行 `npm stage publish`。随后需要在 npm 包管理页面审核 staged
版本并批准到 production。重复执行时会跳过版本和 SHA-1 内容均一致的已
staged 包；同版本内容不一致会直接报错，避免误发不同构建。

```text
.env.publish
NPM_ACCESS_TOKEN=<npm granular access token>
```

`.env.publish` 已被 Git 忽略。token 只在子进程中通过环境变量传递，不写入
tarball、日志或实例配置。

当前发布物覆盖 Linux x64/arm64、Windows x64、macOS x64/arm64；不支持的系统或架构会明确失败。安装阶段不会启动服务或创建业务数据。

## 桌面端

桌面端使用 Electrobun 2.0.5、Bun、React 和 Vite。开发时先启动 Web 服务，再运行：

```bash
bun run dev:desktop
```

构建当前平台的未签名开发包：

```bash
bun run build:desktop
```

Electrobun 的完整构建需要对应平台的图形运行库。Linux 构建和原生冒烟要求 glibc 2.38 或更高；仓库 CI 矩阵使用 Ubuntu 24.04、Windows x64、macOS x64 和 macOS arm64。

## 许可证

LocalShare 使用 [0BSD](LICENSE) 许可证，允许任意使用、修改、分发和商业化，
不要求保留署名，也不要求衍生作品继续开源。

## 质量检查

```bash
bun run check
bun run test:e2e
bun run test:desktop
```

`bun run check` 包含单元测试、生产构建和真实 Chrome E2E。代码修改完成后还必须同步 CodeGraph：

```bash
bun run graph:sync
bun run graph:status
```

## 数据库

```bash
bun run db:generate
bun run db:migrate
```
