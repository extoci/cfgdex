# cfgdex – make `config.toml` feel like settings

cfgdex is a local UI for Codex configuration.

it turns the giant `config.toml` reference into something you can search, understand, and change without hand-editing TOML. it runs locally, opens on a named `.localhost` URL, and saves directly to your Codex config.

## installation

run it directly:

```sh
bunx cfgdex
```

cfgdex starts a local server at the clean Portless URL:

```text
https://cfgdex.localhost
```

the browser opens automatically when the route is ready. set `CFGDEX_NO_OPEN=1` if you want to keep it terminal-only.

it uses [portless](https://portless.sh/) for the named local URL, stays quiet, and does not invoke sudo or modify `/etc/hosts`. `.localhost` names resolve locally in modern browsers. Portless must already be running on its standard HTTPS port:

```sh
sudo portless proxy start --https
bunx cfgdex
```

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

cfgdex reads `~/.codex/config.toml` when it starts and only writes the settings you changed. existing keys that are not shown in the UI are preserved. nested keys with placeholder ids are left out of saves and exports so you can fill in the real table names yourself.

set `CODEX_HOME` if your Codex config lives somewhere else:

```sh
CODEX_HOME=/path/to/codex bunx cfgdex
```

## how it works

cfgdex is mostly a calm editor over the official Codex configuration surface:

- the schema parser lives in `app/config-options.ts`
- the catalog is parsed from the Codex JSON Schema, fetched at startup with a bundled fallback
- the Vite entrypoint lives in `src/main.tsx`
- the UI lives in `app/page.tsx`
- the embedded Vite middleware reads and writes `CODEX_HOME/config.toml` locally
- every save replaces the file atomically and keeps the previous version at `config.toml.bak`
- `bunx cfgdex` starts the local app through Vite and the Portless launcher

it does not need an account, a hosted database, or a cfgdex server.

## trust and privacy

cfgdex is local-first. it does not send your config to a cfgdex service, and it does not require a login. saving is an explicit action, and writes happen through the local process that started cfgdex.

the underlying Codex options can control shell access, networking, approvals, telemetry, and credentials. read the descriptions before changing security-sensitive settings.

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

cfgdex is a plain Vite + React app. Oxlint handles linting and Oxfmt handles formatting; there is no Next, Vinext, Cloudflare, Sites, or framework server in the stack. `bun run schema:sync` refreshes the checked-in fallback from the upstream schema.

the current reference is [here](https://learn.chatgpt.com/docs/config-file/config-reference).
