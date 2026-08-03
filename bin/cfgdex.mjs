#!/usr/bin/env node

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const portlessBin = `${packageRoot}/node_modules/.bin/portless`;

if (args.includes("--help") || args.includes("-h")) {
  console.log("cfgdex - a local Codex config manager");
  console.log("\nStarts the manager at http://cfgdex.localhost");
  console.log("\nUsage: bunx cfgdex");
  process.exit(0);
}

const child = spawn(portlessBin, ["cfgdex", "node", "bin/dev-named.mjs", ...args], {
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
