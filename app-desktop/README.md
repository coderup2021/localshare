# LocalShare Desktop

Electrobun desktop client for connecting to LocalShare servers on the same IPv4
LAN. The discovery screen is a local React application; once a server is
selected, the desktop opens that server's existing `user-web` in a sandboxed
WebView.

## Development

```bash
bun install
bun run --cwd app-desktop prepare:electrobun
bun run dev
bun run dev:desktop
```

`dev:desktop` builds the local discovery view and launches Electrobun. The
Electrobun 2.0.5 toolchain must be available through Hutch. Its paired
Cottontail configuration loader requires glibc 2.38 or newer on Linux.

## Build

```bash
bun run build:desktop
```

On macOS, cross-assemble the Windows x64 package without code signing:

```bash
bun run build:desktop:windows
```

This produces portable, Setup ZIP, standalone Setup EXE and update artifacts in
`releases/windows-x64/`. The official Electrobun Windows runtime is cached under
`app-desktop/.cache/` after the first assembly. Windows execution still needs
to be verified on a Windows host.

The default build uses the canary channel and is intentionally unsigned. Use a
supported host for each target:

- Linux x64
- Windows x64
- macOS x64
- macOS arm64

## Discovery

The client sends a versioned UDP query to `255.255.255.255` and each
interface-specific directed broadcast address on port `49777`. LocalShare
servers respond by unicast. Discovery works only within the same IPv4 broadcast
domain; routers, VLAN boundaries, guest-network client isolation and strict
firewalls may require the manual server address form.

The server firewall must allow inbound UDP `49777`. Override the requested port
with `LOCALSHARE_DISCOVERY_PORT`.

## Connection security

Remote chat content is loaded with Electrobun sandboxing enabled, no preload and
no RPC. Navigation is restricted to the selected server origin. Cross-origin
navigation is delegated to the system browser.
