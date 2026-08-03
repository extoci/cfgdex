#!/usr/bin/env bun

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const schemaUrl =
  process.env.CFGDEX_SCHEMA_URL ?? "https://learn.chatgpt.com/docs/config-schema.json";
const outputPath = resolve("src/config-schema.json");

const response = await fetch(schemaUrl);
if (!response.ok) {
  throw new Error(`Could not fetch ${schemaUrl}: ${response.status} ${response.statusText}`);
}

const schema = await response.json();
if (!schema || typeof schema !== "object" || !schema.properties || !schema.definitions) {
  throw new Error("The downloaded file is not a supported Codex JSON Schema");
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(schema, null, 2)}\n`);

console.log(
  `Synced ${Object.keys(schema.properties).length} root properties and ${Object.keys(schema.definitions).length} definitions from ${schemaUrl}`,
);
