#!/usr/bin/env bun

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const viteModule = fileURLToPath(await import.meta.resolve("vite"));
const viteBin = viteModule.replace(/dist[\\/]node[\\/]index\.js$/, "bin/vite.js");
const port = process.env.PORT || "5173";

const child = spawn(process.execPath, [viteBin, "--host", "127.0.0.1", "--port", port], {
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
