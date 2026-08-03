#!/usr/bin/env node

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const vinextBin = `${packageRoot}/node_modules/.bin/vinext`;
const port = process.env.PORT || "3000";

const child = spawn(vinextBin, ["dev", "--host", "127.0.0.1", "--port", port], {
  cwd: packageRoot,
  stdio: "inherit",
  env: { ...process.env },
});

process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
