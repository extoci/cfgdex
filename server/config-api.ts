import { copyFile, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { Plugin } from "vite";
import { parse, stringify } from "smol-toml";

type Change = {
  key: string;
  type: "toggle" | "select" | "text" | "number" | "code";
  value: boolean | number | string;
};

type ConfigRecord = Record<string, unknown>;

const configHome = resolve(process.env.CODEX_HOME ?? join(homedir(), ".codex"));
const configPath = join(configHome, "config.toml");
const backupPath = `${configPath}.bak`;
let writeQueue = Promise.resolve();

const json = (response: ServerResponse, status: number, body: unknown) => {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
};

const readBody = async (request: IncomingMessage) => {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error("Request body is too large");
  }
  return JSON.parse(body) as { changes?: Change[] };
};

const isRecord = (value: unknown): value is ConfigRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const configExists = async () => {
  try {
    const file = await stat(configPath);
    return file.isFile();
  } catch {
    return false;
  }
};

const readConfig = async () => {
  const exists = await configExists();
  if (!exists) return { exists: false, content: "", config: {} as ConfigRecord };

  const content = await readFile(configPath, "utf8");
  return { exists: true, content, config: parse(content) as ConfigRecord };
};

const pathParts = (key: string) => key.split(".").filter(Boolean);

const setPath = (object: ConfigRecord, parts: string[], value: unknown) => {
  let current = object;
  for (const part of parts.slice(0, -1)) {
    const next = current[part];
    if (!isRecord(next)) current[part] = {};
    current = current[part] as ConfigRecord;
  }
  current[parts.at(-1)!] = value;
};

const deletePath = (object: ConfigRecord, parts: string[]) => {
  if (!parts.length) return;
  const parents: Array<{ object: ConfigRecord; key: string }> = [];
  let current: unknown = object;
  for (const part of parts.slice(0, -1)) {
    if (!isRecord(current) || !isRecord(current[part])) return;
    parents.push({ object: current, key: part });
    current = current[part];
  }
  if (!isRecord(current)) return;
  delete current[parts.at(-1)!];
  for (const parent of parents.reverse()) {
    const value = parent.object[parent.key];
    if (isRecord(value) && Object.keys(value).length === 0) delete parent.object[parent.key];
  }
};

const parseChangeValue = (change: Change) => {
  if (change.type !== "toggle" && String(change.value).trim() === "") return undefined;

  if (change.type === "code") {
    const raw = String(change.value).trim();
    const parsed = parse(`__cfgdex_value = ${raw}`) as ConfigRecord;
    return parsed.__cfgdex_value;
  }

  if (change.type === "number") {
    const value = typeof change.value === "number" ? change.value : Number(change.value);
    if (!Number.isFinite(value)) throw new Error(`${change.key} must be a number`);
    return value;
  }

  if (change.type === "toggle") {
    if (typeof change.value !== "boolean") throw new Error(`${change.key} must be a boolean`);
    return change.value;
  }

  return String(change.value);
};

const writeConfig = async (changes: Change[]) => {
  const current = await readConfig();
  const config = current.config;

  for (const change of changes) {
    const parts = pathParts(change.key);
    if (!parts.length || parts.some((part) => part.startsWith("<"))) continue;
    const value = parseChangeValue(change);
    if (value === undefined) deletePath(config, parts);
    else setPath(config, parts, value);
  }

  const output = `${stringify(config)}\n`;
  await mkdir(dirname(configPath), { recursive: true, mode: 0o700 });
  if (current.exists) await copyFile(configPath, backupPath);

  let mode = 0o600;
  if (current.exists) {
    try {
      mode = (await stat(configPath)).mode & 0o777;
    } catch {
      // Use the private default when the existing mode cannot be read.
    }
  }

  const temporaryPath = `${configPath}.cfgdex-${process.pid}-${Date.now()}.tmp`;
  try {
    await writeFile(temporaryPath, output, { encoding: "utf8", mode });
    await rename(temporaryPath, configPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }

  return { content: output, config, backupPath: current.exists ? backupPath : null };
};

const handleConfigRequest = async (request: IncomingMessage, response: ServerResponse) => {
  try {
    if (request.method === "GET") {
      const current = await readConfig();
      json(response, 200, { path: configPath, ...current });
      return;
    }

    if (request.method !== "PUT") {
      response.setHeader("allow", "GET, PUT");
      json(response, 405, { error: "Method not allowed" });
      return;
    }

    const body = await readBody(request);
    if (!Array.isArray(body.changes)) throw new Error("changes must be an array");
    const operation = writeQueue.then(() => writeConfig(body.changes!));
    writeQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    const result = await operation;
    json(response, 200, { path: configPath, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update config.toml";
    json(response, 422, { error: message });
  }
};

export const configApi = (): Plugin => ({
  name: "cfgdex-config-api",
  configureServer(server) {
    server.middlewares.use("/api/config", (request, response, next) => {
      void handleConfigRequest(request, response).catch(next);
    });
  },
});
