# cfgdex – make `config.toml` feel like settings

cfgdex is a local UI for Codex configuration.

it turns the giant `config.toml` reference into something you can search, understand, and change without hand-editing TOML. it runs locally, opens on a named `.localhost` URL, and keeps drafts in your browser.

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

- all 275 keys in the current Codex `config.toml` reference
- search across keys, labels, and descriptions
- grouped views for model behavior, approvals, shell, tools, agents, features, providers, TUI, telemetry, and advanced permissions
- toggles for booleans, selects for enums, and TOML-friendly editors for arrays, tables, maps, and paths
- changed-only view, revert, and export to `config.toml`
- browser-local drafts through `localStorage`

## usage

pick a section from the sidebar, or search for the exact key you want:

```text
model_reasoning_effort
approval_policy
mcp_servers.<id>.command
features.network_proxy.domains
```

cfgdex only exports the values you changed. nested keys with placeholder ids are left out of the export so you can fill in the real table names yourself.

## how it works

cfgdex is mostly a calm editor over the official Codex configuration surface:

- the catalog lives in `app/config-options.ts`
- the catalog is parsed from the Codex JSON Schema, fetched at startup with a bundled fallback
- the Vite entrypoint lives in `src/main.tsx`
- the UI lives in `app/page.tsx`
- changes stay in browser storage until you export them
- `bunx cfgdex` starts the local app through Vite and the Portless launcher

it does not need an account, a hosted database, or a cfgdex server.

## trust and privacy

cfgdex is local-first. it does not send your config to a cfgdex service, and it does not require a login. browser drafts stay in the local browser profile. exporting a file is an explicit action.

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
