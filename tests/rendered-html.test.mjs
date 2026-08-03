import assert from "node:assert/strict";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the cfgdex configuration manager", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>cfgdex — Codex configuration, in one place<\/title>/i);
  assert.match(html, /Your config, in one place/);
  assert.match(html, /documented settings/);
  assert.match(html, /Model &amp; behavior/);
  assert.match(html, /model_reasoning_effort/);
  assert.match(html, /local-first/i);
  assert.doesNotMatch(html, /Your site is taking shape/);
  assert.doesNotMatch(html, /codex-preview/);
});

test("the prototype keeps local app state and CLI metadata", async () => {
  const packageJson = await (await import("node:fs/promises")).readFile(
    new URL("package.json", templateRoot),
    "utf8",
  );
  assert.match(packageJson, /"name":\s*"cfgdex"/);
  assert.match(packageJson, /"cfgdex":\s*"bin\/cfgdex\.mjs"/);
  assert.match(packageJson, /portless/);
});
