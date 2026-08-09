#!/usr/bin/env bun

import { spawn } from "node:child_process";
import http from "node:http";
import https from "node:https";
import { networkInterfaces } from "node:os";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const rawArgs = process.argv.slice(2);
const isClient = rawArgs[0] === "client";
const args = isClient ? rawArgs.slice(1) : rawArgs;
const portlessModule = fileURLToPath(await import.meta.resolve("portless"));
const portlessBin = portlessModule.replace(/dist[\\/]index\.js$/, "dist/cli.js");
const defaultServerPort = 5173;
const defaultClientUrl = "https://diskthing.local";

const usage = () => {
  console.log("cfgdex - a Codex config manager for one machine or a small LAN");
  console.log("\nUsage:");
  console.log("  bunx cfgdex             Start the config server");
  console.log("  bunx cfgdex client      Connect a local UI to a config server");
  console.log("\nThe client opens https://diskthing.local by default.");
  console.log("Set CFGDEX_NO_OPEN=1 to keep the browser closed.");
};

if (rawArgs.includes("--help") || rawArgs.includes("-h")) {
  usage();
  process.exit(0);
}

if ((!isClient && rawArgs.length > 0) || (isClient && args.length > 0)) {
  console.error(`cfgdex: unknown command or option ${rawArgs[isClient ? 1 : 0]}`);
  console.error("Run `bunx cfgdex --help` for usage.");
  process.exit(1);
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

const requestStatus = (
  url,
  { local = false, requirePortless = false, requireSuccess = true } = {},
) =>
  new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      resolve({ ok: false });
      return;
    }

    const isHttps = parsed.protocol === "https:";
    const request = (isHttps ? https : http).request(
      {
        hostname: local ? "127.0.0.1" : parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: "GET",
        headers: { host: parsed.host },
        ...(isHttps ? { rejectUnauthorized: false, servername: parsed.hostname } : {}),
        timeout: 750,
      },
      (response) => {
        const portless = response.headers["x-portless"] === "1";
        response.resume();
        resolve({
          ok:
            (!requireSuccess || (response.statusCode >= 200 && response.statusCode < 300)) &&
            (!requirePortless || portless),
        });
      },
    );
    request.once("error", () => resolve({ ok: false }));
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

const serverUrlFromInput = (input, defaultPort) => {
  const raw = input.trim();
  if (!raw) throw new Error("A server IP or hostname is required");

  const possibleIpv6 =
    raw.includes(":") && raw.split(":").length > 2 && !raw.includes("/") && !raw.startsWith("[");
  const address = possibleIpv6 ? `[${raw}]` : raw;
  const parsed = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(address) ? address : `http://${address}`);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("The server address must use http:// or https://");
  }
  if (
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("Enter only the server IP or hostname, optionally followed by a port");
  }
  if (!parsed.port) parsed.port = String(defaultPort);
  return parsed.origin;
};

const askForServer = async () => {
  const configured = process.env.CFGDEX_SERVER_URL ?? process.env.CFGDEX_SERVER_IP;
  if (configured?.trim()) return configured;
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("The client needs an address; set CFGDEX_SERVER_IP or CFGDEX_SERVER_URL");
  }

  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await prompt.question("Linux server IP: ");
  } finally {
    prompt.close();
  }
};

const networkAddresses = () => {
  const addresses = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      const family =
        typeof entry.family === "string" ? entry.family : entry.family === 4 ? "IPv4" : "IPv6";
      if (family === "IPv4" && !entry.internal && !addresses.includes(entry.address)) {
        addresses.push(entry.address);
      }
    }
  }
  return addresses;
};

const launch = (command, commandArgs, env) => {
  const child = spawn(command, commandArgs, {
    cwd: packageRoot,
    env,
    stdio: ["ignore", "ignore", "pipe"],
  });
  const state = { child, childExited: false, code: null, signal: null, stderr: "" };

  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk) => {
    state.stderr = `${state.stderr}${chunk}`.slice(-2000);
  });
  child.once("error", (error) => {
    state.stderr = `${state.stderr}\n${error.message}`.slice(-2000);
  });

  const forwardSignal = (signal) => {
    if (state.childExited) return;
    child.kill(signal);
    setTimeout(() => {
      if (!state.childExited) child.kill("SIGKILL");
    }, 2000).unref();
  };
  const onInterrupt = () => forwardSignal("SIGINT");
  const onTerminate = () => forwardSignal("SIGTERM");
  process.once("SIGINT", onInterrupt);
  process.once("SIGTERM", onTerminate);

  state.finished = new Promise((resolve) => {
    child.once("exit", (code, signal) => {
      state.childExited = true;
      state.code = code;
      state.signal = signal;
      process.removeListener("SIGINT", onInterrupt);
      process.removeListener("SIGTERM", onTerminate);
      resolve(state);
    });
  });

  return state;
};

const failureDetail = (state, fallback) => {
  const detail = state.stderr.trim().split("\n").filter(Boolean).slice(-1)[0];
  return detail || fallback;
};

const runServer = async () => {
  const serverPort = parsePort("CFGDEX_SERVER_PORT", defaultServerPort);
  const env = {
    ...process.env,
    CFGDEX_MODE: "server",
    CFGDEX_BIND_HOST: process.env.CFGDEX_BIND_HOST ?? "0.0.0.0",
    CFGDEX_APP_PORT: String(serverPort),
    PORT: String(serverPort),
  };
  const state = launch(process.execPath, ["bin/dev-named.mjs"], env);
  const ready = await waitForUrl(
    `http://127.0.0.1:${serverPort}/api/config`,
    {},
    150,
    () => state.childExited,
  );

  if (!ready) {
    if (!state.childExited) {
      state.child.kill("SIGTERM");
      await state.finished;
    }
    console.error(`cfgdex: ${failureDetail(state, "the config server did not start")}`);
    process.exit(1);
  }

  const addresses = networkAddresses();
  console.log(`cfgdex server ready on port ${serverPort}`);
  for (const address of addresses.length ? addresses : ["127.0.0.1"]) {
    const displayAddress = address.includes(":") ? `[${address}]` : address;
    console.log(`  http://${displayAddress}:${serverPort}`);
  }
  console.log("On the laptop, run: bunx cfgdex client");

  const result = await state.finished;
  if (result.code !== 0 && result.code !== 130 && result.code !== 143 && result.signal === null) {
    console.error(`cfgdex: ${failureDetail(result, `the server exited with code ${result.code}`)}`);
  }
  process.exit(result.signal ? 128 : (result.code ?? 0));
};

const runClient = async () => {
  const serverPort = parsePort("CFGDEX_SERVER_PORT", defaultServerPort);
  const remoteUrl = serverUrlFromInput(await askForServer(), serverPort);
  const proxyPort = parsePort("CFGDEX_PROXY_PORT", 443);
  const proxyTls = process.env.CFGDEX_PROXY_TLS !== "0";
  const proxyProtocol = proxyTls ? "https" : "http";
  const configuredClientUrl =
    process.env.CFGDEX_CLIENT_URL?.trim() ||
    (proxyProtocol === "https" ? defaultClientUrl : "http://diskthing.local");
  const parsedClientUrl = new URL(configuredClientUrl);
  if (parsedClientUrl.protocol !== `${proxyProtocol}:`) {
    throw new Error(
      `CFGDEX_CLIENT_URL must use ${proxyProtocol}:// with the current proxy settings`,
    );
  }
  if (!parsedClientUrl.hostname.endsWith(".local")) {
    throw new Error("CFGDEX_CLIENT_URL must use a .local hostname");
  }

  const localName = parsedClientUrl.hostname.slice(0, -".local".length);
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(localName)) {
    throw new Error("CFGDEX_CLIENT_URL must use a simple .local hostname");
  }
  const defaultProxyPort = proxyTls ? 443 : 80;
  if (!parsedClientUrl.port && proxyPort !== defaultProxyPort) {
    parsedClientUrl.port = String(proxyPort);
  }
  const clientUrl = parsedClientUrl.toString().replace(/\/$/, "");

  if (!(await waitForUrl(`${remoteUrl}/api/config`, {}, 10))) {
    throw new Error(`Could not reach cfgdex at ${remoteUrl}; check the IP and firewall`);
  }

  const env = {
    ...process.env,
    CFGDEX_MODE: "client",
    CFGDEX_BIND_HOST: "127.0.0.1",
    CFGDEX_REMOTE_URL: remoteUrl,
    PORTLESS_HTTPS: proxyTls ? "1" : "0",
    PORTLESS_PORT: String(proxyPort),
    PORTLESS_LAN: "1",
    PORTLESS_SYNC_HOSTS: "0",
    PORTLESS_TLD: "local",
    ...(process.env.CFGDEX_CLIENT_PORT
      ? { PORTLESS_APP_PORT: String(parsePort("CFGDEX_CLIENT_PORT", 5173)) }
      : {}),
  };
  const state = launch(
    process.execPath,
    [portlessBin, localName, "--force", process.execPath, "bin/dev-named.mjs"],
    env,
  );

  const ready = await waitForUrl(
    clientUrl,
    { local: true, requirePortless: true },
    150,
    () => state.childExited,
  );
  if (!ready) {
    if (!state.childExited) {
      state.child.kill("SIGTERM");
      await state.finished;
    }
    console.error(`cfgdex: ${failureDetail(state, "the client did not start")}`);
    process.exit(1);
  }

  console.log(`cfgdex client connected to ${remoteUrl}`);
  console.log(`cfgdex running at ${clientUrl}`);
  console.log(`opening ${clientUrl}`);
  if (process.env.CFGDEX_NO_OPEN !== "1") openBrowser(clientUrl);

  const result = await state.finished;
  if (result.code !== 0 && result.code !== 130 && result.code !== 143 && result.signal === null) {
    console.error(`cfgdex: ${failureDetail(result, `the client exited with code ${result.code}`)}`);
  }
  process.exit(result.signal ? 128 : (result.code ?? 0));
};

try {
  await (isClient ? runClient() : runServer());
} catch (error) {
  console.error(`cfgdex: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
