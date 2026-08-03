import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

test("builds the cfgdex Vite entrypoint", async () => {
  const html = await readFile(new URL("dist/index.html", templateRoot), "utf8");
  assert.match(html, /<title>cfgdex — Codex configuration, in one place<\/title>/i);
  assert.match(html, /<div id="root"><\/div>/);
  assert.match(html, /<script type="module"[^>]+src="\/.+\.js"/);
});

test("ships the configuration manager and local CLI metadata", async () => {
  const [page, options, packageJson] = await Promise.all([
    readFile(new URL("app/page.tsx", templateRoot), "utf8"),
    readFile(new URL("app/config-options.ts", templateRoot), "utf8"),
    readFile(new URL("package.json", templateRoot), "utf8"),
  ]);

  assert.match(page, /Your config, in one place/);
  assert.match(page, /documented settings/);
  assert.match(page, /Model & behavior/);
  assert.match(options, /model_reasoning_effort/);
  assert.match(page, /local-first/i);
  assert.match(packageJson, /"cfgdex":\s*"bin\/cfgdex\.mjs"/);
  assert.match(packageJson, /"vite":\s*"8\.0\.13"/);
  assert.match(packageJson, /"packageManager":\s*"bun@1\.3\.14"/);
  assert.match(packageJson, /"typescript":\s*"7\.0\.2"/);
  assert.match(packageJson, /"oxlint":\s*"1\.76\.0"/);
  assert.match(packageJson, /"oxfmt":\s*"0\.61\.0"/);
  assert.doesNotMatch(packageJson, /vinext|next|wrangler|cloudflare|eslint/);
});
