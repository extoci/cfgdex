#!/usr/bin/env bun

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const viteModule = fileURLToPath(await import.meta.resolve("vite"));
const viteBin = viteModule.replace(/dist[\\/]node[\\/]index\.js$/, "bin/vite.js");
const host = process.env.CFGDEX_BIND_HOST || "127.0.0.1";
const port = process.env.PORT || process.env.CFGDEX_APP_PORT || "5173";

const child = spawn(process.execPath, [viteBin, "--host", host, "--port", port, "--strictPort"], {
  cwd: packageRoot,
  stdio: "inherit",
  env: { ...process.env },
});

const forwardSignal = (signal) => child.kill(signal);
process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
