# cfgdex – make `config.toml` feel like settings

cfgdex is a local UI for Codex configuration.

it turns the giant `config.toml` reference into something you can search, understand, and change without hand-editing TOML. it runs locally, opens on a named `.localhost` URL, and keeps drafts in your browser.

## installation

run it directly:

```sh
bunx cfgdex
```

cfgdex starts a local server at a quiet, unprivileged local port and prints the URL:

```text
http://cfgdex.localhost:<port>
```

it uses [portless](https://portless.sh/) for the named local URL, but does not ask for sudo or modify `/etc/hosts`. `.localhost` names resolve locally in modern browsers. the port is intentional: binding the clean `http://cfgdex.localhost` or `https://cfgdex.localhost` URL requires a system-level service on port 80 or 443.

```sh
npm run dev:named
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
- the UI lives in `app/page.tsx`
- changes stay in browser storage until you export them
- `bunx cfgdex` starts the local app through a tiny Portless launcher

it does not need an account, a hosted database, or a cfgdex server.

## trust and privacy

cfgdex is local-first. it does not send your config to a cfgdex service, and it does not require a login. browser drafts stay in the local browser profile. exporting a file is an explicit action.

the underlying Codex options can control shell access, networking, approvals, telemetry, and credentials. read the descriptions before changing security-sensitive settings.

## development

requirements:

- Node.js `>=22.13.0`
- npm or Bun

```sh
npm install
npm run dev:named
npm run lint
npm test
```

the current reference is [here](https://learn.chatgpt.com/docs/config-file/config-reference).
