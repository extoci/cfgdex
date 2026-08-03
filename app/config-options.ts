import bundledSchema from "../src/config-schema.json";

export const CONFIG_SCHEMA_URL = "https://learn.chatgpt.com/docs/config-schema.json";

export type SettingKind = "toggle" | "select" | "text" | "number" | "code";
export type SettingValue = boolean | number | string;

export type SettingOption = {
  key: string;
  label: string;
  section: string;
  description: string;
  type: SettingKind;
  options?: string[];
  placeholder?: string;
  defaultValue?: SettingValue;
  risk?: "high";
};

type JsonSchemaNode = JsonSchema | boolean;

type JsonSchema = {
  $ref?: string;
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  properties?: Record<string, JsonSchemaNode>;
  additionalProperties?: JsonSchemaNode;
  items?: JsonSchemaNode;
  allOf?: JsonSchemaNode[];
  oneOf?: JsonSchemaNode[];
  anyOf?: JsonSchemaNode[];
};

export type ConfigSchema = JsonSchema & {
  definitions: Record<string, JsonSchemaNode>;
};

const schemaDefinitions = (bundledSchema as unknown as ConfigSchema).definitions;

const sectionMeta = [
  {
    id: "model",
    label: "Model & behavior",
    description: "Models, reasoning, and response defaults.",
    icon: "✦",
  },
  {
    id: "safety",
    label: "Approvals & sandbox",
    description: "Boundaries for commands, files, and network access.",
    icon: "◈",
  },
  {
    id: "tools",
    label: "Tools & integrations",
    description: "MCP servers, tools, providers, and connectors.",
    icon: "⊙",
  },
  {
    id: "agents",
    label: "Agents & profiles",
    description: "Agent roles, profiles, and project-specific configuration.",
    icon: "◎",
  },
  {
    id: "features",
    label: "Features",
    description: "Experimental and product capabilities.",
    icon: "⌁",
  },
  {
    id: "shell",
    label: "Shell & workspace",
    description: "Terminal behavior, paths, and workspace discovery.",
    icon: "⌘",
  },
  {
    id: "tui",
    label: "Terminal UI",
    description: "Codex’s terminal interface and notifications.",
    icon: "▦",
  },
  {
    id: "telemetry",
    label: "Telemetry & auth",
    description: "Analytics, authentication, and diagnostics.",
    icon: "◍",
  },
  {
    id: "advanced",
    label: "Advanced",
    description: "Lower-level configuration and escape hatches.",
    icon: "⚙",
  },
] as const;

export type SectionMeta = (typeof sectionMeta)[number];

const sectionForKey = (key: string) => {
  const root = key.split(".")[0];

  if (
    [
      "model",
      "model_provider",
      "model_catalog_json",
      "model_context_window",
      "model_auto_compact_token_limit",
      "model_auto_compact_token_limit_scope",
      "model_instructions_file",
      "openai_base_url",
      "chatgpt_base_url",
      "oss_provider",
      "review_model",
      "plan_mode_reasoning_effort",
      "personality",
      "service_tier",
    ].includes(root)
  ) {
    return "model";
  }

  if (
    [
      "approval_policy",
      "approvals_reviewer",
      "permissions",
      "sandbox_mode",
      "sandbox_workspace_write",
      "default_permissions",
    ].includes(root)
  ) {
    return "safety";
  }

  if (
    [
      "mcp_servers",
      "mcp_oauth_callback_port",
      "mcp_oauth_callback_url",
      "mcp_oauth_credentials_store",
      "apps",
      "apps_mcp_product_sku",
      "model_providers",
      "tools",
      "tool_suggest",
    ].includes(root)
  ) {
    return "tools";
  }

  if (
    [
      "agents",
      "profile",
      "profiles",
      "projects",
      "project_root_markers",
      "project_doc_fallback_filenames",
      "project_doc_max_bytes",
    ].includes(root)
  ) {
    return "agents";
  }

  if (root === "features") return "features";

  if (
    [
      "shell_environment_policy",
      "allow_login_shell",
      "instructions",
      "developer_instructions",
      "log_dir",
      "sqlite_home",
      "project_root_markers",
    ].includes(root)
  ) {
    return "shell";
  }

  if (["tui", "disable_paste_burst", "notify", "file_opener"].includes(root)) return "tui";

  if (
    [
      "analytics",
      "cli_auth_credentials_store",
      "forced_login_method",
      "forced_chatgpt_workspace_id",
      "otel",
      "feedback",
      "history",
      "memories",
    ].includes(root)
  ) {
    return "telemetry";
  }

  return "advanced";
};

const humanize = (value: string) =>
  value
    .replace(/^<.*>$/, "entry")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

const mergeSchemas = (schemas: JsonSchemaNode[]) => {
  const merged: JsonSchema = {};

  for (const schema of schemas) {
    if (typeof schema === "boolean") continue;
    if (schema.description) merged.description = schema.description;
    if (schema.title) merged.title = schema.title;
    if (schema.type) merged.type = schema.type;
    if (schema.default !== undefined) merged.default = schema.default;
    if (schema.enum) merged.enum = [...(merged.enum ?? []), ...schema.enum];
    if (schema.properties) merged.properties = { ...merged.properties, ...schema.properties };
    if (schema.additionalProperties !== undefined)
      merged.additionalProperties = schema.additionalProperties;
    if (schema.items) merged.items = schema.items;
    if (schema.oneOf) merged.oneOf = [...(merged.oneOf ?? []), ...schema.oneOf];
    if (schema.anyOf) merged.anyOf = [...(merged.anyOf ?? []), ...schema.anyOf];
  }

  return merged;
};

const resolveSchema = (schema: JsonSchemaNode, seen = new Set<string>()): JsonSchema => {
  if (typeof schema === "boolean") return {};
  if (schema.$ref) {
    const name = schema.$ref.replace(/^#\/definitions\//, "");
    if (seen.has(name)) return schema;
    const nextSeen = new Set(seen).add(name);
    const resolved = schemaDefinitions[name];
    if (!resolved) return schema;
    const { $ref: _ref, ...local } = schema;
    return mergeSchemas([resolveSchema(resolved, nextSeen), resolveSchema(local, nextSeen)]);
  }

  if (schema.allOf) {
    const { allOf: _allOf, ...local } = schema;
    return mergeSchemas([
      ...schema.allOf.map((part) => resolveSchema(part, seen)),
      resolveSchema(local, seen),
    ]);
  }

  return schema;
};

const variantsOf = (schema: JsonSchema) =>
  [...(schema.oneOf ?? []), ...(schema.anyOf ?? [])].map((variant) => resolveSchema(variant));

const enumValues = (schema: JsonSchema) => {
  const values = [
    ...(schema.enum ?? []),
    ...variantsOf(schema).flatMap((variant) => variant.enum ?? []),
  ];
  return [...new Set(values.filter((value): value is string => typeof value === "string"))];
};

const objectProperties = (schema: JsonSchema): Record<string, JsonSchemaNode> => {
  const variants = variantsOf(schema);
  return Object.assign({}, schema.properties, ...variants.map((variant) => variant.properties));
};

const hasDynamicEntries = (schema: JsonSchema) => schema.additionalProperties !== undefined;

const scalarDefault = (schema: JsonSchema) => {
  if (
    typeof schema.default === "boolean" ||
    typeof schema.default === "number" ||
    typeof schema.default === "string"
  ) {
    return schema.default;
  }
  return undefined;
};

const isSensitive = (key: string) =>
  /(approval|sandbox|permission|credential|secret|token|auth|password|private.key|api.key)/i.test(
    key,
  );

const kindFor = (schema: JsonSchema, enums: string[]): SettingKind => {
  if (enums.length) return "select";
  if (schema.type === "boolean") return "toggle";
  if (schema.type === "integer" || schema.type === "number") return "number";
  if (schema.type === "array" || schema.type === "object") return "code";
  return "text";
};

const descriptionFor = (schema: JsonSchema, fallback: string) =>
  (schema.description ?? fallback)
    .replaceAll(/\s+/g, " ")
    .replaceAll(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .trim();

function flattenSchema(schema: ConfigSchema) {
  const options: SettingOption[] = [];
  const visit = (rawSchema: JsonSchemaNode, key: string, parentDescription?: string) => {
    if (rawSchema === false) return;
    const resolved = resolveSchema(rawSchema);
    const enums = enumValues(resolved);
    const properties = objectProperties(resolved);
    const kind = kindFor(resolved, enums);
    const fallback = parentDescription ?? `Configure ${humanize(key.split(".").at(-1) ?? key)}.`;

    if (
      enums.length ||
      resolved.type === "boolean" ||
      resolved.type === "integer" ||
      resolved.type === "number" ||
      resolved.type === "string"
    ) {
      options.push({
        key,
        label: humanize(key.split(".").at(-1) ?? key),
        section: sectionForKey(key),
        description: descriptionFor(resolved, fallback),
        type: kind,
        options: kind === "select" ? enums : undefined,
        defaultValue: scalarDefault(resolved),
        placeholder: kind === "code" ? "Enter a TOML value" : undefined,
        risk: isSensitive(key) ? "high" : undefined,
      });
    } else if (!Object.keys(properties).length || hasDynamicEntries(resolved)) {
      options.push({
        key,
        label: humanize(key.split(".").at(-1) ?? key),
        section: sectionForKey(key),
        description: descriptionFor(resolved, fallback),
        type: kind,
        placeholder: "Enter a TOML value",
        risk: isSensitive(key) ? "high" : undefined,
      });
    }

    for (const [childKey, childSchema] of Object.entries(properties)) {
      visit(childSchema, `${key}.${childKey}`, resolved.description ?? parentDescription);
    }
  };

  for (const [key, schemaEntry] of Object.entries(schema.properties ?? {})) visit(schemaEntry, key);

  return options;
}

export const parseConfigSchema = (schema: ConfigSchema) => flattenSchema(schema);

export const settingOptions = parseConfigSchema(bundledSchema as unknown as ConfigSchema);

export const sections = sectionMeta.map((section) => ({ ...section }));

export const sectionCounts = settingOptions.reduce<Record<string, number>>((counts, option) => {
  counts[option.section] = (counts[option.section] ?? 0) + 1;
  return counts;
}, {});

export const sectionFor = (id: string) =>
  sectionMeta.find((section) => section.id === id) ?? sectionMeta.at(-1)!;
