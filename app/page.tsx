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
        rows={4}
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
      <p>{error || "This editor is generated from Codex’s JSON Schema."}</p>
    </div>
  );
}

export default function Home() {
  const [activeSection, setActiveSection] = useState("model");
  const [search, setSearch] = useState("");
  const [showChanged, setShowChanged] = useState(false);
  const [options, setOptions] = useState(bundledOptions);
  const [selectedKey, setSelectedKey] = useState(bundledOptions[0]?.key ?? "");
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

  useEffect(() => {
    if (visibleOptions.length && !visibleOptions.some((option) => option.key === selectedKey)) {
      setSelectedKey(visibleOptions[0].key);
    }
  }, [selectedKey, visibleOptions]);

  const selectedOption = options.find((option) => option.key === selectedKey) ?? visibleOptions[0];
  const selectedValue = selectedOption ? valueFor(selectedOption, values) : "";
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

  const resetChanges = () => {
    setValues(baseline);
    setSavedMessage("Reverted changes");
  };

  const resetSelected = () => {
    if (!selectedOption) return;
    updateValue(selectedOption.key, baseline[selectedOption.key] ?? emptyValueFor(selectedOption));
  };

  const saveChanges = () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
    setBaseline(values);
    setSavedMessage("Saved locally");
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
        <div className="topbar-breadcrumb">
          <span>config.toml</span>
          <span>/</span>
          <strong>{activeLabel}</strong>
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
          <div className="file-context">
            <span className="file-icon">⌁</span>
            <div>
              <strong>config.toml</strong>
              <span>~/.codex/config.toml</span>
            </div>
          </div>
          <div className="sidebar-heading">
            <span>Sections</span>
            <span>{options.length}</span>
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
          <div className="sidebar-bottom">
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
              Read config reference <span>↗</span>
            </a>
          </div>
        </aside>

        <section className="workspace">
          <div className="workspace-heading">
            <div>
              <p className="eyebrow">Local workspace</p>
              <h1>Configuration</h1>
              <p className="workspace-description">
                Edit the Codex schema without losing the shape of your config.
              </p>
            </div>
            <div className="workspace-summary">
              <strong>{options.length}</strong>
              <span>schema-backed settings</span>
              <span className="summary-divider" />
              <strong>{changedCount}</strong>
              <span>changed</span>
            </div>
          </div>

          <div className="workbench">
            <section className="list-pane" aria-label="Settings list">
              <div className="list-toolbar">
                <label className="search-box">
                  <span className="search-icon">⌕</span>
                  <span className="sr-only">Search settings</span>
                  <input
                    ref={searchRef}
                    type="search"
                    value={search}
                    placeholder="Search settings"
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  <kbd>⌘ K</kbd>
                </label>
                <div className="list-toolbar-meta">
                  <span>
                    {visibleOptions.length} {search || showChanged ? "matches" : "settings"}
                  </span>
                  <button
                    type="button"
                    className={`filter-button ${showChanged ? "is-active" : ""}`}
                    onClick={() => setShowChanged((visible) => !visible)}
                  >
                    Changed only
                    {changedCount > 0 && <span className="filter-count">{changedCount}</span>}
                  </button>
                </div>
              </div>
              <div className="list-heading">
                <span>{search ? "Search results" : activeLabel}</span>
                <span>Value</span>
              </div>
              <div className="setting-list">
                {visibleOptions.length ? (
                  visibleOptions.map((option) => {
                    const value = valueFor(option, values);
                    const changed = changedKeys.has(option.key);
                    return (
                      <button
                        type="button"
                        key={option.key}
                        className={`setting-list-item ${selectedOption?.key === option.key ? "is-selected" : ""} ${changed ? "is-changed" : ""}`}
                        onClick={() => setSelectedKey(option.key)}
                        aria-current={selectedOption?.key === option.key ? "true" : undefined}
                      >
                        <span className="list-item-copy">
                          <span className="list-item-title">
                            {option.label}
                            {changed && <i aria-label="Changed" />}
                          </span>
                          <code>{option.key}</code>
                        </span>
                        <span className={`list-item-value value-${option.type}`}>
                          {formatValue(value, option.type)}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <div className="empty-state">
                    <strong>No settings found</strong>
                    <p>Try a broader search, or clear the filter.</p>
                    <button type="button" className="button button-quiet" onClick={clearFilters}>
                      Clear filters
                    </button>
                  </div>
                )}
              </div>
            </section>

            <aside className="detail-pane" aria-label="Setting editor">
              {selectedOption ? (
                <>
                  <div className="detail-header">
                    <div className="detail-section">
                      <span>{sectionFor(selectedOption.section).label}</span>
                      {changedKeys.has(selectedOption.key) && (
                        <span className="detail-changed">Changed</span>
                      )}
                    </div>
                    <h2>{selectedOption.label}</h2>
                    <code className="detail-key">{selectedOption.key}</code>
                  </div>
                  <p className="detail-description">{selectedOption.description}</p>
                  {selectedOption.risk && (
                    <div className="risk-note">
                      <span>!</span>
                      <p>
                        This setting can affect security or access. Review the value before saving.
                      </p>
                    </div>
                  )}
                  <div className="detail-field">
                    <div className="field-heading">
                      <label htmlFor={selectedOption.key}>Value</label>
                      <span>{selectedOption.type}</span>
                    </div>
                    <div id={selectedOption.key}>
                      <SettingControl
                        option={selectedOption}
                        value={selectedValue}
                        onChange={(value) => updateValue(selectedOption.key, value)}
                      />
                    </div>
                    <p className="field-help">
                      {selectedOption.defaultValue !== undefined
                        ? `Default: ${String(selectedOption.defaultValue)}`
                        : "No default. Leave empty to omit it from the export."}
                    </p>
                  </div>
                  <dl className="detail-meta">
                    <div>
                      <dt>Section</dt>
                      <dd>{sectionFor(selectedOption.section).label}</dd>
                    </div>
                    <div>
                      <dt>Type</dt>
                      <dd>{selectedOption.type}</dd>
                    </div>
                    <div>
                      <dt>State</dt>
                      <dd>{changedKeys.has(selectedOption.key) ? "Edited" : "Unchanged"}</dd>
                    </div>
                  </dl>
                  <div className="detail-actions">
                    <button
                      type="button"
                      className="button button-quiet"
                      onClick={resetSelected}
                      disabled={!changedKeys.has(selectedOption.key)}
                    >
                      Reset setting
                    </button>
                    <a href={CONFIG_SCHEMA_URL} target="_blank" rel="noreferrer">
                      Open schema ↗
                    </a>
                  </div>
                </>
              ) : (
                <div className="empty-detail">
                  <span>◌</span>
                  <strong>Select a setting</strong>
                  <p>Choose an option from the list to edit it.</p>
                </div>
              )}
            </aside>
          </div>
          <footer className="content-footer">
            <span>cfgdex · local-first</span>
            <span>Schema-driven · no account required</span>
          </footer>
        </section>
      </div>
    </main>
  );
}
