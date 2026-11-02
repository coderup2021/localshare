# LocalShare

LocalShare runs a public LAN chat with text, images, videos, files, search and
real-time WebSocket updates.

```bash
npm install -g localshare-server
localshare start
localshare status
localshare restart
localshare stop
```

The first `start` asks for:

- Data directory, default: `~/.localshare`
- Listen IPv4, default: `0.0.0.0` (all IPv4 interfaces)

Later starts reuse the saved configuration. To enter it again:

```bash
localshare restart --reset
```

Non-interactive configuration is also supported:

```bash
localshare start --data-dir /srv/localshare --ip 0.0.0.0
```

Production defaults:

- Web and admin UI: `http://<host>:8888/`
- Admin UI: `http://<host>:8888/admin/`
- API and WebSocket: `http://<host>:8887/`

When binding `0.0.0.0`, LocalShare prints the first available LAN IPv4 address.

The first start initializes the database administrator `localShare` with the
default password `12345678`. Change it after the first login.

Data, uploads, logs, PID/lock files and instance configuration are written only
under the directory supplied with `--data-dir`.
