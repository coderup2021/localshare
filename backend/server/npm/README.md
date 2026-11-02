# LocalShare

LocalShare runs a public LAN chat with text, images, videos, files, search and
real-time WebSocket updates.

```bash
npm install -g localshare-server
localshare start --data-dir /srv/localshare --ip 192.168.1.10
localshare status
localshare restart
localshare stop
```

Production defaults:

- Web and admin UI: `http://<ip>:8888/`
- Admin UI: `http://<ip>:8888/admin/`
- API and WebSocket: `http://<ip>:8887/`

The first start initializes the database administrator `localShare` with the
default password `12345678`. Change it after the first login.

Data, uploads, logs, PID/lock files and instance configuration are written only
under the directory supplied with `--data-dir`.
