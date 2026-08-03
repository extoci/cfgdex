#!/usr/bin/env bun

import { spawn } from "node:child_process";
import http from "node:http";
import https from "node:https";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const portlessModule = fileURLToPath(await import.meta.resolve("portless"));
const portlessBin = portlessModule.replace(/dist[\\/]index\.js$/, "dist/cli.js");

if (args.includes("--help") || args.includes("-h")) {
  console.log("cfgdex - a local Codex config manager");
  console.log("\nStarts the manager at https://cfgdex.localhost");
  console.log("\nUsage: bunx cfgdex");
  process.exit(0);
}

const parsePort = (name, fallback) => {
  const value = process.env[name];
  if (value === undefined) return fallback;

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be a port between 1 and 65535`);
  }
  return port;
};

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const requestStatus = (url, { requirePortless = false, requireSuccess = true } = {}) =>
  new Promise((resolve) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const request = (isHttps ? https : http).request(
      {
        hostname: "127.0.0.1",
        port: parsed.port || (isHttps ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: "GET",
        headers: { host: parsed.host },
        rejectUnauthorized: false,
        servername: parsed.hostname,
        timeout: 750,
      },
      (response) => {
        const portless = response.headers["x-portless"] === "1";
        response.resume();
        resolve({
          ok:
            (!requireSuccess || (response.statusCode >= 200 && response.statusCode < 300)) &&
            (!requirePortless || portless),
          portless,
        });
      },
    );
    request.once("error", () => resolve({ ok: false, portless: false }));
    request.once("timeout", () => request.destroy());
    request.end();
  });

const waitForUrl = async (url, options, attempts = 100, shouldStop = () => false) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (shouldStop()) return false;
    if ((await requestStatus(url, options)).ok) return true;
    await wait(100);
  }
  return false;
};

const openBrowser = (url) => {
  const command =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const commandArgs = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const browser = spawn(command, commandArgs, {
    detached: true,
    stdio: "ignore",
  });
  browser.once("error", () => {});
  browser.unref();
};

let proxyPort;
try {
  proxyPort = parsePort("CFGDEX_PROXY_PORT", 443);
} catch (error) {
  console.error(`cfgdex: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const proxyTls = process.env.CFGDEX_PROXY_TLS !== "0";
const proxyProtocol = proxyTls ? "https" : "http";
const defaultProxyPort = proxyTls ? 443 : 80;
const proxyUrl = `${proxyProtocol}://cfgdex.localhost${proxyPort === defaultProxyPort ? "" : `:${proxyPort}`}/`;

if (!(await waitForUrl(proxyUrl, { requirePortless: true, requireSuccess: false }, 3))) {
  console.error(`cfgdex: Portless is not running at ${proxyUrl.replace(/\/$/, "")}`);
  console.error("Start the Portless proxy once, then run cfgdex again.");
  process.exit(1);
}

const env = {
  ...process.env,
  PORTLESS_HTTPS: proxyTls ? "1" : "0",
  PORTLESS_PORT: String(proxyPort),
  PORTLESS_SYNC_HOSTS: "0",
  PORTLESS_TLD: "localhost",
};

const child = spawn(
  process.execPath,
  [portlessBin, "cfgdex", "--force", process.execPath, "bin/dev-named.mjs", ...args],
  {
    cwd: packageRoot,
    env,
    stdio: ["ignore", "ignore", "pipe"],
  },
);

let childExited = false;
let stderr = "";
child.stderr?.setEncoding("utf8");
child.stderr?.on("data", (chunk) => {
  stderr = `${stderr}${chunk}`.slice(-2000);
});

const forwardSignal = (signal) => {
  if (childExited) return;
  child.kill(signal);
  setTimeout(() => {
    if (!childExited) child.kill("SIGKILL");
  }, 2000).unref();
};

process.once("SIGINT", () => forwardSignal("SIGINT"));
process.once("SIGTERM", () => forwardSignal("SIGTERM"));

child.once("error", (error) => {
  stderr = `${stderr}\n${error.message}`.slice(-2000);
});

child.once("exit", async (code, signal) => {
  childExited = true;
  if (code !== 0 && code !== 130 && code !== 143 && signal === null) {
    const detail = stderr.trim().split("\n").filter(Boolean).slice(-1)[0];
    console.error(`cfgdex: ${detail || `the server exited with code ${code}`}`);
  }
  process.exit(signal ? 128 : (code ?? 0));
});

if (await waitForUrl(proxyUrl, { requirePortless: true }, 150, () => childExited)) {
  console.log(`cfgdex running at ${proxyUrl}`);
  if (process.env.CFGDEX_NO_OPEN !== "1") openBrowser(proxyUrl);
} else {
  if (!childExited) {
    console.error("cfgdex: Portless could not route to the local app");
    forwardSignal("SIGTERM");
  }
}
