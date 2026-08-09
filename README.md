# cfgdex – make `config.toml` feel like settings

cfgdex is a small-server UI for Codex configuration.

it turns the giant `config.toml` reference into something you can search, understand, and change without hand-editing TOML. the config stays on the machine that runs the server; a laptop can connect to it through a local client UI.

## server and client

on the Linux machine that owns the Codex config:

```sh
bunx cfgdex
```

the server listens on port `5173` on the machine's network interfaces and prints the addresses to use. the port can be changed with `CFGDEX_SERVER_PORT`.

```text
http://192.168.1.42:5173
```

on the Mac or other laptop:

```sh
bunx cfgdex client
```

the client asks for the server IP, starts the local UI and its bundled Portless route, then opens:

```text
https://diskthing.local
```

the browser UI runs on the laptop, while reads and saves go to the Linux server. cfgdex configures Portless LAN mode automatically for `diskthing.local`; the first run may ask for permission to start its HTTPS proxy. set `CFGDEX_NO_OPEN=1` if you want to keep the browser closed. for scripts or repeatable launches, set either `CFGDEX_SERVER_IP` or `CFGDEX_SERVER_URL`.

set `CFGDEX_CLIENT_URL` for a different `.local` name, `CFGDEX_CLIENT_PORT` for a fixed app port, or `CFGDEX_PROXY_PORT` when Portless should use a different proxy port.

the server does not open a browser or depend on the laptop's local routing. it binds to `0.0.0.0` by default so the laptop can reach it; use `CFGDEX_BIND_HOST=127.0.0.1` when you intentionally want a local-only server.

## what it does

- the current Codex `config.toml` surface, parsed from its JSON Schema
- search across keys, labels, and descriptions
- grouped views for model behavior, approvals, shell, tools, agents, features, providers, TUI, telemetry, and advanced permissions
- toggles for booleans, selects for enums, and TOML-friendly editors for arrays, tables, maps, and paths
- changed-only view, revert, and export to `config.toml`
- automatic read/write of `~/.codex/config.toml` with a `.bak` backup on save

## usage

pick a section from the sidebar, or search for the exact key you want:

```text
model_reasoning_effort
approval_policy
mcp_servers.<id>.command
features.network_proxy.domains
```

cfgdex reads `~/.codex/config.toml` on the server when the UI connects and only writes the settings you changed. existing keys that are not shown in the UI are preserved. nested keys with placeholder ids are left out of saves and exports so you can fill in the real table names yourself.

set `CODEX_HOME` on the server if its Codex config lives somewhere else:

```sh
CODEX_HOME=/path/to/codex bunx cfgdex
```

## how it works

cfgdex is mostly a calm editor over the official Codex configuration surface:

- the schema parser lives in `app/config-options.ts`
- the catalog is parsed from the Codex JSON Schema, fetched at startup with a bundled fallback
- the Vite entrypoint lives in `src/main.tsx`
- the UI lives in `app/page.tsx`
- the server's embedded Vite middleware reads and writes `CODEX_HOME/config.toml`
- the client runs the same UI locally and proxies `/api/config` to the server address
- the client configures bundled Portless LAN mode and routes the `.local` hostname to the client port
- every save replaces the file atomically and keeps the previous version at `config.toml.bak`
- `bunx cfgdex` starts the network-facing config server; `bunx cfgdex client` starts the local named UI

it does not need an account, a hosted database, or a third-party relay.

## trust and privacy

cfgdex is local-first. it does not send your config to a cfgdex service, and it does not require a login. on a client connection, config requests travel directly from the laptop to the server over the local network. saving is an explicit action, and writes happen on the machine running `bunx cfgdex`.

the server is intentionally reachable by anyone who can reach its listening port. keep it on a trusted network or restrict `CFGDEX_BIND_HOST`/firewall rules before exposing it more broadly. the underlying Codex options can control shell access, networking, approvals, telemetry, and credentials. read the descriptions before changing security-sensitive settings.

## development

requirements:

- Bun `>=1.3.14`
- TypeScript 7 for typechecking

```sh
bun install
bun run dev:named
bun run typecheck
bun run lint
bun run format:check
bun run test
bun run schema:sync
```

cfgdex is a plain Vite + React app. Oxlint handles linting and Oxfmt handles formatting; there is no Next, Vinext, Cloudflare, Sites, or framework server in the stack. `bun run dev:named` starts the local development app through Vite. `bun run schema:sync` refreshes the checked-in fallback from the upstream schema.

the current reference is [here](https://learn.chatgpt.com/docs/config-file/config-reference).
