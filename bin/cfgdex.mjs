#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const portlessModule = fileURLToPath(await import.meta.resolve("portless"));
const portlessBin = portlessModule.replace(/dist[\\/]index\.js$/, "dist/cli.js");

if (args.includes("--help") || args.includes("-h")) {
  console.log("cfgdex - a local Codex config manager");
  console.log("\nStarts the manager at http://cfgdex.localhost:<port>");
  console.log("\nUsage: bunx cfgdex");
  process.exit(0);
}

const parsePort = (name) => {
  const value = process.env[name];
  if (value === undefined) return undefined;

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`${name} must be an unprivileged port between 1024 and 65535`);
  }
  return port;
};

const findFreePort = (exclude) =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : undefined;
      server.close((error) => {
        if (error) {
          reject(error);
        } else if (!port || port === exclude) {
          findFreePort(exclude).then(resolve, reject);
        } else {
          resolve(port);
        }
      });
    });
  });

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const responds = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 750);

  try {
    const response = await fetch(url, { signal: controller.signal });
    await response.body?.cancel();
    return response.status >= 200 && response.status < 300;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

const waitForApp = async (url, attempts = 100) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await responds(url)) return true;
    await wait(100);
  }
  return false;
};

const stopProxy = (env, port) =>
  new Promise((resolve) => {
    const stopper = spawn(process.execPath, [portlessBin, "proxy", "stop", "--port", String(port)], {
      cwd: packageRoot,
      env,
      stdio: "ignore",
    });
    const finish = () => resolve();
    stopper.once("error", finish);
    stopper.once("exit", finish);
    setTimeout(() => {
      stopper.kill("SIGKILL");
      resolve();
    }, 2000).unref();
  });

let proxyPort;
let appPort;
try {
  proxyPort = parsePort("CFGDEX_PROXY_PORT") ?? (await findFreePort());
  appPort = parsePort("CFGDEX_PORT") ?? (await findFreePort(proxyPort));
} catch (error) {
  console.error(`cfgdex: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const stateDir = await mkdtemp(join(os.tmpdir(), "cfgdex-portless-"));
const env = {
  ...process.env,
  PORTLESS_APP_PORT: String(appPort),
  PORTLESS_HTTPS: "0",
  PORTLESS_PORT: String(proxyPort),
  PORTLESS_STATE_DIR: stateDir,
  PORTLESS_SYNC_HOSTS: "0",
  PORTLESS_TLD: "localhost",
};

const child = spawn(
  process.execPath,
  [portlessBin, "cfgdex", "--app-port", String(appPort), "node", "bin/dev-named.mjs", ...args],
  {
    cwd: packageRoot,
    env,
    stdio: ["ignore", "ignore", "pipe"],
  },
);

let childExited = false;
let finalizing = false;
let stderr = "";
child.stderr?.setEncoding("utf8");
child.stderr?.on("data", (chunk) => {
  stderr = `${stderr}${chunk}`.slice(-2000);
});

const cleanup = async () => {
  await stopProxy(env, proxyPort);
  await rm(stateDir, { force: true, recursive: true });
};

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
  if (finalizing) return;
  finalizing = true;
  await cleanup();

  if (code !== 0 && code !== 130 && code !== 143 && signal === null) {
    const detail = stderr.trim().split("\n").filter(Boolean).slice(-1)[0];
    console.error(`cfgdex: ${detail || `the server exited with code ${code}`}`);
  }

  process.exit(signal ? 128 : code ?? 0);
});

const appUrl = `http://127.0.0.1:${appPort}/`;
const namedUrl = `http://cfgdex.localhost:${proxyPort}/`;
const appReady = await waitForApp(appUrl);

if (!appReady) {
  console.error("cfgdex: the local app did not start");
  forwardSignal("SIGTERM");
} else {
  const proxyReady = await waitForApp(namedUrl, 35);
  console.log(`cfgdex running at ${proxyReady ? namedUrl : `http://cfgdex.localhost:${appPort}/`}`);
}
