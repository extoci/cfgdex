import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CONFIG_SCHEMA_URL,
  parseConfigSchema,
  sectionFor,
  sections,
  settingOptions as bundledOptions,
  type SettingKind,
  type SettingOption,
  type SettingValue,
} from "./config-options";

const STORAGE_KEY = "cfgdex-values-v1";

const emptyValueFor = (option: SettingOption): SettingValue =>
  option.defaultValue ?? (option.type === "toggle" ? false : "");

const defaultsFor = (options: SettingOption[]) =>
  Object.fromEntries(options.map((option) => [option.key, emptyValueFor(option)]));

const readStoredValues = (options: SettingOption[]) => {
  const defaults = defaultsFor(options);
  if (typeof window === "undefined") return defaults;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored
      ? { ...defaults, ...(JSON.parse(stored) as Record<string, SettingValue>) }
      : defaults;
  } catch {
    return defaults;
  }
};

const valueFor = (option: SettingOption, values: Record<string, SettingValue>) =>
  values[option.key] ?? emptyValueFor(option);

const formatValue = (value: SettingValue, kind: SettingKind) => {
  if (kind === "toggle") return value ? "On" : "Off";
  if (value === "" || value === undefined) return "Not set";
  return String(value);
};

const tomlValue = (value: SettingValue, kind: SettingKind) => {
  if (kind === "code") return String(value || "").trim();
  if (kind === "number") return String(value);
  if (typeof value === "boolean") return String(value);
  return JSON.stringify(value);
};

const countsFor = (options: SettingOption[]) =>
  options.reduce<Record<string, number>>((counts, option) => {
    counts[option.section] = (counts[option.section] ?? 0) + 1;
    return counts;
  }, {});

function SettingControl({
  option,
  value,
  onChange,
}: {
  option: SettingOption;
  value: SettingValue;
  onChange: (value: SettingValue) => void;
}) {
  if (option.type === "toggle") {
    const checked = Boolean(value);
    return (
      <button
        type="button"
        className={`switch ${checked ? "is-on" : ""}`}
        role="switch"
        aria-checked={checked}
        aria-label={`${option.label}: ${formatValue(value, option.type)}`}
        onClick={() => onChange(!checked)}
      >
        <span className="switch-track" />
        <span className="switch-knob" />
      </button>
    );
  }

  if (option.type === "select") {
    return (
      <label className="select-control">
        <span className="sr-only">{option.label}</span>
        <select
          value={String(value)}
          aria-label={option.label}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Not set</option>
          {option.options?.map((item) => (
            <option key={item} value={item}>
              {item.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <span className="select-chevron">⌄</span>
      </label>
    );
  }

  if (option.type === "code") {
    return (
      <textarea
        className="setting-input setting-code"
        value={String(value)}
        placeholder={option.placeholder}
        aria-label={option.label}
        rows={2}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  return (
    <input
      className="setting-input"
      type={option.type === "number" ? "number" : "text"}
      value={String(value)}
      placeholder={option.placeholder}
      aria-label={option.label}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function SettingRow({
  option,
  value,
  changed,
  onChange,
}: {
  option: SettingOption;
  value: SettingValue;
  changed: boolean;
  onChange: (value: SettingValue) => void;
}) {
  return (
    <div className={`setting-row ${changed ? "is-changed" : ""} ${option.risk ? "is-risk" : ""}`}>
      <div className="setting-info">
        <div className="setting-heading">
          <span className="setting-label">{option.label}</span>
          {changed && <span className="changed-dot" aria-label="Changed" />}
          {option.risk && <span className="risk-label">Sensitive</span>}
        </div>
        <code className="setting-key">{option.key}</code>
        <p>{option.description}</p>
      </div>
      <div className={`setting-editor setting-editor-${option.type}`}>
        <SettingControl option={option} value={value} onChange={onChange} />
        <span className="type-hint">{formatValue(value, option.type)}</span>
      </div>
    </div>
  );
}

function SchemaStatus({
  status,
  error,
  onRefresh,
}: {
  status: "loading" | "live" | "bundled";
  error: string;
  onRefresh: () => void;
}) {
  const label =
    status === "loading"
      ? "Checking schema"
      : status === "live"
        ? "Live schema"
        : "Bundled snapshot";
  return (
    <div className="schema-status">
      <div className="schema-status-heading">
        <span className={`status-dot status-${status}`} />
        <span>{label}</span>
        <button
          type="button"
          className="icon-button"
          onClick={onRefresh}
          aria-label="Refresh schema"
        >
          ↻
        </button>
      </div>
      <p>{error || "Schema metadata is used to build this editor."}</p>
    </div>
  );
}

export default function Home() {
  const [activeSection, setActiveSection] = useState("model");
  const [search, setSearch] = useState("");
  const [showChanged, setShowChanged] = useState(false);
  const [options, setOptions] = useState(bundledOptions);
  const [values, setValues] = useState<Record<string, SettingValue>>(() =>
    readStoredValues(bundledOptions),
  );
  const [baseline, setBaseline] = useState<Record<string, SettingValue>>(() =>
    readStoredValues(bundledOptions),
  );
  const [savedMessage, setSavedMessage] = useState("Saved locally");
  const [schemaStatus, setSchemaStatus] = useState<"loading" | "live" | "bundled">("bundled");
  const [schemaError, setSchemaError] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const sectionCounts = useMemo(() => countsFor(options), [options]);

  const loadLiveSchema = useCallback(async () => {
    setSchemaStatus("loading");
    setSchemaError("");

    try {
      const response = await fetch(CONFIG_SCHEMA_URL, { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`Schema request returned ${response.status}`);
      const nextOptions = parseConfigSchema(await response.json());
      if (!nextOptions.length) throw new Error("The schema did not contain any settings");
      setOptions(nextOptions);
      setSchemaStatus("live");
    } catch (error) {
      setSchemaStatus("bundled");
      setSchemaError(
        error instanceof Error
          ? `${error.message}. Using the bundled snapshot.`
          : "Using the bundled snapshot.",
      );
    }
  }, []);

  useEffect(() => {
    void loadLiveSchema();
  }, [loadLiveSchema]);

  useEffect(() => {
    const nextDefaults = defaultsFor(options);
    setValues((current) => ({ ...nextDefaults, ...current }));
    setBaseline((current) => ({ ...nextDefaults, ...current }));
  }, [options]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape" && document.activeElement === searchRef.current) {
        setSearch("");
        searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const changedKeys = useMemo(
    () =>
      new Set(
        options
          .filter((option) => values[option.key] !== baseline[option.key])
          .map((option) => option.key),
      ),
    [baseline, options, values],
  );

  const visibleOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return options.filter((option) => {
      const inSection =
        Boolean(query) || activeSection === "all" || option.section === activeSection;
      const matchesQuery =
        !query ||
        option.key.toLowerCase().includes(query) ||
        option.label.toLowerCase().includes(query) ||
        option.description.toLowerCase().includes(query);
      const matchesChanged = !showChanged || changedKeys.has(option.key);
      return inSection && matchesQuery && matchesChanged;
    });
  }, [activeSection, changedKeys, options, search, showChanged]);

  const groups = useMemo(() => {
    const grouped = new Map<string, SettingOption[]>();
    for (const option of visibleOptions)
      grouped.set(option.section, [...(grouped.get(option.section) ?? []), option]);
    return sections
      .map((section) => ({ section, options: grouped.get(section.id) ?? [] }))
      .filter((group) => group.options.length > 0);
  }, [visibleOptions]);

  const changedCount = changedKeys.size;
  const activeLabel = search
    ? "Search results"
    : activeSection === "all"
      ? "All settings"
      : sectionFor(activeSection).label;

  const updateValue = (key: string, value: SettingValue) => {
    setValues((current) => ({ ...current, [key]: value }));
    setSavedMessage("Unsaved changes");
  };

  const saveChanges = () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
    setBaseline(values);
    setSavedMessage("Saved locally");
  };

  const resetChanges = () => {
    setValues(baseline);
    setSavedMessage("Reverted changes");
  };

  const exportToml = () => {
    const lines = options
      .filter((option) => changedKeys.has(option.key) && !option.key.includes("<"))
      .map((option) => ({ option, value: tomlValue(valueFor(option, values), option.type) }))
      .filter(({ value }) => value.length > 0)
      .map(({ option, value }) => `${option.key} = ${value}`);
    const output = [
      "# Exported by cfgdex",
      "# Review nested tables and placeholder ids before using this file.",
      "",
      ...(lines.length ? lines : ["# No changed settings yet."]),
      "",
    ].join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([output], { type: "text/plain" }));
    link.download = "config.toml";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const chooseSection = (section: string) => {
    setActiveSection(section);
    setSearch("");
    setShowChanged(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const clearFilters = () => {
    setSearch("");
    setShowChanged(false);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand-lockup" href="#top" aria-label="cfgdex home">
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <span className="brand-name">cfgdex</span>
          <span className="local-pill">local</span>
        </a>
        <div className="topbar-context">
          <span className="context-slash">/</span>
          <span>Configuration</span>
        </div>
        <div className="topbar-actions">
          <span className={`save-state ${changedCount ? "has-changes" : ""}`}>
            <span className="save-state-dot" />
            {savedMessage}
          </span>
          <button
            type="button"
            className="button button-quiet"
            onClick={resetChanges}
            disabled={!changedCount}
          >
            Discard
          </button>
          <button type="button" className="button button-quiet" onClick={exportToml}>
            Export
          </button>
          <button
            type="button"
            className="button button-dark"
            onClick={saveChanges}
            disabled={!changedCount}
          >
            Save changes{changedCount > 0 && <span className="button-count">{changedCount}</span>}
          </button>
        </div>
      </header>

      <div className="app-layout" id="top">
        <aside className="sidebar">
          <div className="sidebar-scroll">
            <div className="file-card">
              <span className="file-icon">⌁</span>
              <span className="file-card-copy">
                <strong>config.toml</strong>
                <small>~/.codex/config.toml</small>
              </span>
              <span className="file-card-status">local</span>
            </div>

            <div className="nav-heading-row">
              <span>Configuration</span>
              <span className="nav-count">{options.length}</span>
            </div>
            <nav className="side-nav" aria-label="Configuration sections">
              <button
                type="button"
                className={`nav-item ${activeSection === "all" && !search ? "is-active" : ""}`}
                onClick={() => chooseSection("all")}
              >
                <span className="nav-glyph">◫</span>
                <span>All settings</span>
                <span className="nav-item-count">{options.length}</span>
              </button>
              {sections.map((section) => (
                <button
                  type="button"
                  key={section.id}
                  className={`nav-item ${activeSection === section.id && !search ? "is-active" : ""}`}
                  onClick={() => chooseSection(section.id)}
                >
                  <span className="nav-glyph">{section.icon}</span>
                  <span>{section.label}</span>
                  <span className="nav-item-count">{sectionCounts[section.id] ?? 0}</span>
                </button>
              ))}
            </nav>
          </div>
          <div className="sidebar-footer">
            <SchemaStatus
              status={schemaStatus}
              error={schemaError}
              onRefresh={() => void loadLiveSchema()}
            />
            <a
              href="https://learn.chatgpt.com/docs/config-file/config-reference"
              target="_blank"
              rel="noreferrer"
              className="docs-link"
            >
              <span>?</span> Config schema <span className="external-arrow">↗</span>
            </a>
          </div>
        </aside>

        <section className="content-area">
          <div className="content-header">
            <div className="eyebrow">
              <span className="eyebrow-line" /> Codex configuration
            </div>
            <div className="title-row">
              <div>
                <h1>Make your config make sense.</h1>
                <p>
                  Search the reference, adjust what matters, and export a clean config when you are
                  ready.
                </p>
              </div>
              <div className="catalog-stat">
                <span className="catalog-number">{options.length}</span>
                <span>schema-backed settings</span>
              </div>
            </div>
          </div>

          <div className="toolbar">
            <label className="search-box">
              <span className="search-icon">⌕</span>
              <span className="sr-only">Search settings</span>
              <input
                ref={searchRef}
                type="search"
                value={search}
                placeholder="Search settings, keys, or descriptions"
                onChange={(event) => setSearch(event.target.value)}
              />
              <kbd>⌘ K</kbd>
            </label>
            <div className="view-actions">
              <button
                type="button"
                className={`filter-button ${showChanged ? "is-active" : ""}`}
                onClick={() => setShowChanged((visible) => !visible)}
              >
                <span className="filter-icon">◒</span> Changed only{" "}
                {changedCount > 0 && <span className="filter-count">{changedCount}</span>}
              </button>
              {changedCount > 0 && (
                <button type="button" className="reset-button" onClick={resetChanges}>
                  Discard edits
                </button>
              )}
            </div>
          </div>

          <div className="content-meta">
            <div className="meta-breadcrumb">
              <span>config.toml</span>
              <span className="breadcrumb-arrow">›</span>
              <strong>{activeLabel}</strong>
            </div>
            <div className="meta-note">
              <span className="meta-check">✓</span>
              {schemaStatus === "live"
                ? "Schema fetched from Codex"
                : "Using bundled schema snapshot"}
            </div>
          </div>

          <div className="quick-stats" aria-label="Configuration summary">
            <div>
              <strong>{visibleOptions.length}</strong>
              <span>{search || showChanged ? "matching" : "in view"}</span>
            </div>
            <div>
              <strong>{changedCount}</strong>
              <span>changed</span>
            </div>
            <div>
              <strong>{sections.length}</strong>
              <span>sections</span>
            </div>
            <a href={CONFIG_SCHEMA_URL} target="_blank" rel="noreferrer">
              View source <span>↗</span>
            </a>
          </div>

          {activeSection === "all" && !search && !showChanged && (
            <div className="intro-card">
              <div className="intro-icon">✦</div>
              <div>
                <strong>Start with the settings that shape your day-to-day.</strong>
                <p>
                  Use the sections for a focused view, or search the full schema above. Empty fields
                  stay out of your export.
                </p>
              </div>
              <button type="button" className="intro-link" onClick={() => chooseSection("model")}>
                Open model settings <span>→</span>
              </button>
            </div>
          )}

          <div className="results-bar">
            <span>
              {search || showChanged
                ? `${visibleOptions.length} matching settings`
                : `${visibleOptions.length} settings in view`}
            </span>
            <span className="results-rule" />
            <span className="results-help">Changes are saved locally</span>
          </div>

          <div className="settings-groups">
            {groups.length ? (
              groups.map(({ section, options: groupOptions }) => (
                <section className="settings-group" key={section.id}>
                  <div className="group-heading">
                    <div className="group-heading-icon">{section.icon}</div>
                    <div>
                      <h2>{section.label}</h2>
                      <p>{section.description}</p>
                    </div>
                    <span className="group-count">{groupOptions.length}</span>
                  </div>
                  <div className="settings-panel">
                    {groupOptions.map((option) => (
                      <SettingRow
                        key={option.key}
                        option={option}
                        value={valueFor(option, values)}
                        changed={changedKeys.has(option.key)}
                        onChange={(value) => updateValue(option.key, value)}
                      />
                    ))}
                  </div>
                </section>
              ))
            ) : (
              <div className="empty-state">
                <div className="empty-symbol">⌕</div>
                <strong>No settings found</strong>
                <p>Try a broader search, or clear the changed-only filter.</p>
                <button type="button" className="button button-quiet" onClick={clearFilters}>
                  Clear filters
                </button>
              </div>
            )}
          </div>

          <footer className="content-footer">
            <span>
              cfgdex <span className="footer-version">local-first</span>
            </span>
            <span>Schema-driven · no account required</span>
          </footer>
        </section>
      </div>
    </main>
  );
}
