# LocalShare

局域网内共享文本、图片、视频和文件的轻量服务。

一期包含：

- `backend/server`：Bun + Hono + SQLite + Drizzle API/WebSocket 服务
- `backend/web-user`：免登录公共频道
- `backend/web-admin`：管理员端

## 环境要求

- Bun 1.4+
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

首次运行前可从 `.env.example` 创建本地 `.env`。数据库和附件默认保存在仓库根目录
`.data/`，该目录不会提交。

## 生产安装与运行

发布候选包为 `localshare-server`，平台运行时通过
`localshare-server-linux-x64` 安装：

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

当前发布物支持 Linux x64；不支持平台会明确失败。安装阶段不会启动服务或创建业务数据。

## 许可证

LocalShare 使用 [0BSD](LICENSE) 许可证，允许任意使用、修改、分发和商业化，
不要求保留署名，也不要求衍生作品继续开源。

## 质量检查

```bash
bun run check
bun run test:e2e
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
