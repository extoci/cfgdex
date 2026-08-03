"use client";

import { useMemo, useState } from "react";
import {
  sectionCounts,
  settingOptions,
  type SettingKind,
  type SettingOption,
  type SettingValue,
} from "./config-options";

const STORAGE_KEY = "cfgdex-values-v1";

const sections = [
  { id: "model", label: "Model & behavior", icon: "✦" },
  { id: "safety", label: "Approvals & sandbox", icon: "◈" },
  { id: "shell", label: "Shell & workspace", icon: "⌘" },
  { id: "tools", label: "Tools & integrations", icon: "⊙" },
  { id: "agents", label: "Agents", icon: "◎" },
  { id: "features", label: "Features", icon: "⌁" },
  { id: "providers", label: "Model providers", icon: "◌" },
  { id: "tui", label: "TUI", icon: "▦" },
  { id: "telemetry", label: "Telemetry & auth", icon: "◍" },
  { id: "advanced", label: "Advanced", icon: "⚙" },
];

const defaultValues: Record<string, SettingValue> = Object.fromEntries(
  settingOptions.map((option) => [
    option.key,
    option.defaultValue ??
      (option.type === "toggle" ? false : option.type === "number" ? "" : ""),
  ]),
);

function readStoredValues() {
  if (typeof window === "undefined") return defaultValues;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...defaultValues, ...(JSON.parse(stored) as Record<string, SettingValue>) };
  } catch {
    // Local storage is a convenience; a malformed saved draft should not block the UI.
  }
  return defaultValues;
}

function valueFor(option: SettingOption, values: Record<string, SettingValue>) {
  return (
    values[option.key] ??
    option.defaultValue ??
    (option.type === "toggle" ? false : option.type === "number" ? "" : "")
  );
}

function formatValue(value: SettingValue, kind: SettingKind) {
  if (kind === "toggle") return value ? "Enabled" : "Disabled";
  if (value === "" || value === undefined) return "Not set";
  return String(value);
}

function tomlValue(value: SettingValue, kind: SettingKind) {
  if (kind === "code") return String(value || "").trim();
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  return JSON.stringify(value);
}

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
          {!option.defaultValue && <option value="">Not set</option>}
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
      onChange={(event) =>
        onChange(option.type === "number" ? event.target.value : event.target.value)
      }
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
      <div className="setting-copy">
        <div className="setting-title-line">
          <span className="setting-label">{option.label}</span>
          {changed && <span className="changed-dot" aria-label="Unsaved change" />}
          {option.risk && <span className="risk-label">sensitive</span>}
        </div>
        <code className="setting-key">{option.key}</code>
        <p>{option.description}</p>
      </div>
      <div className="setting-editor">
        <SettingControl option={option} value={value} onChange={onChange} />
        <span className="type-hint">{option.type === "toggle" ? "boolean" : option.type}</span>
      </div>
    </div>
  );
}

export default function Home() {
  const [activeSection, setActiveSection] = useState("model");
  const [search, setSearch] = useState("");
  const [showChanged, setShowChanged] = useState(false);
  const [values, setValues] = useState<Record<string, SettingValue>>(readStoredValues);
  const [baseline, setBaseline] = useState<Record<string, SettingValue>>(readStoredValues);
  const [savedMessage, setSavedMessage] = useState("Saved locally");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const changedKeys = useMemo(
    () =>
      new Set(
        settingOptions
          .filter((option) => values[option.key] !== baseline[option.key])
          .map((option) => option.key),
      ),
    [baseline, values],
  );

  const visibleOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return settingOptions.filter((option) => {
      const inSection = activeSection === "all" || option.section === activeSection;
      const matchesQuery =
        !query ||
        option.key.toLowerCase().includes(query) ||
        option.label.toLowerCase().includes(query) ||
        option.description.toLowerCase().includes(query);
      const matchesChanged = !showChanged || changedKeys.has(option.key);
      return inSection && matchesQuery && matchesChanged;
    });
  }, [activeSection, changedKeys, search, showChanged]);

  const changedCount = changedKeys.size;

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
    const lines = settingOptions
      .filter((option) => changedKeys.has(option.key) && !option.key.includes("<"))
      .map((option) => `${option.key} = ${tomlValue(valueFor(option, values), option.type)}`);
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
    setMobileNavOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const activeLabel =
    activeSection === "all"
      ? "All settings"
      : sections.find((section) => section.id === activeSection)?.label ?? "Settings";

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><span /></div>
          <span className="brand-name">cfgdex</span>
          <span className="local-pill">local</span>
        </div>
        <div className="topbar-context">
          <span className="context-slash">/</span>
          <span>Configuration</span>
        </div>
        <div className="topbar-actions">
          <span className={`save-state ${changedCount ? "has-changes" : ""}`}>
            <span className="save-state-dot" />
            {savedMessage}
          </span>
          <button type="button" className="button button-quiet" onClick={exportToml}>
            <span className="button-icon">↓</span> Export TOML
          </button>
          <button type="button" className="button button-dark" onClick={saveChanges} disabled={!changedCount}>
            Save changes
          </button>
        </div>
        <button
          type="button"
          className="mobile-menu-button"
          onClick={() => setMobileNavOpen((open) => !open)}
          aria-label="Toggle navigation"
          aria-expanded={mobileNavOpen}
        >
          <span />
          <span />
        </button>
      </header>

      <div className="app-layout">
        <aside className={`sidebar ${mobileNavOpen ? "is-open" : ""}`}>
          <div className="sidebar-scroll">
            <button type="button" className="file-card" onClick={() => chooseSection("all")}>
              <span className="file-icon">⌁</span>
              <span className="file-card-copy">
                <strong>config.toml</strong>
                <small>~/.codex/config.toml</small>
              </span>
              <span className="file-card-chevron">›</span>
            </button>

            <div className="nav-heading-row">
              <span>Settings</span>
              <span className="nav-count">{settingOptions.length}</span>
            </div>
            <nav className="side-nav" aria-label="Configuration sections">
              <button
                type="button"
                className={`nav-item ${activeSection === "all" ? "is-active" : ""}`}
                onClick={() => chooseSection("all")}
              >
                <span className="nav-glyph">◫</span>
                <span>All settings</span>
                <span className="nav-item-count">{settingOptions.length}</span>
              </button>
              {sections.map((section) => (
                <button
                  type="button"
                  key={section.id}
                  className={`nav-item ${activeSection === section.id ? "is-active" : ""}`}
                  onClick={() => chooseSection(section.id)}
                >
                  <span className="nav-glyph">{section.icon}</span>
                  <span>{section.label}</span>
                  <span className="nav-item-count">{sectionCounts[section.id]}</span>
                </button>
              ))}
            </nav>
          </div>
          <div className="sidebar-footer">
            <div className="workspace-card">
              <span className="workspace-avatar">⌂</span>
              <div>
                <strong>Local workspace</strong>
                <span>Changes stay on this machine</span>
              </div>
              <span className="online-dot" />
            </div>
            <a href="https://learn.chatgpt.com/docs/config-file/config-reference" target="_blank" rel="noreferrer" className="docs-link">
              <span>?</span> Read the config reference <span className="external-arrow">↗</span>
            </a>
          </div>
        </aside>

        <section className="content-area">
          <div className="content-header">
            <div className="eyebrow"><span className="eyebrow-line" /> CODEX CONFIGURATION</div>
            <div className="title-row">
              <div>
                <h1>Your config, in one place.</h1>
                <p>Understand every option, make a change, and keep your Codex setup easy to reason about.</p>
              </div>
              <div className="catalog-stat">
                <span className="catalog-number">{settingOptions.length}</span>
                <span>documented settings</span>
              </div>
            </div>
            <div className="toolbar">
              <label className="search-box">
                <span className="search-icon">⌕</span>
                <span className="sr-only">Search settings</span>
                <input
                  type="search"
                  value={search}
                  placeholder="Search settings, keys, or descriptions"
                  onChange={(event) => setSearch(event.target.value)}
                />
                <kbd>⌘ K</kbd>
              </label>
              <div className="view-actions">
                <button type="button" className={`filter-button ${showChanged ? "is-active" : ""}`} onClick={() => setShowChanged((visible) => !visible)}>
                  <span className="filter-icon">◒</span>
                  Changed only
                  {changedCount > 0 && <span className="filter-count">{changedCount}</span>}
                </button>
                {changedCount > 0 && (
                  <button type="button" className="reset-button" onClick={resetChanges}>Revert</button>
                )}
              </div>
            </div>
          </div>

          <div className="content-meta">
            <div className="meta-breadcrumb"><span>config.toml</span><span className="breadcrumb-arrow">›</span><strong>{activeLabel}</strong></div>
            <div className="meta-note"><span className="meta-check">✓</span> Synced with the current Codex reference</div>
          </div>

          {activeSection === "all" && !search && !showChanged && (
            <div className="intro-card">
              <div className="intro-icon">✦</div>
              <div>
                <strong>Start with the settings that shape your day-to-day.</strong>
                <p>Use the sections on the left for a focused view, or search the full reference above. Empty fields stay out of your exported file.</p>
              </div>
              <button type="button" className="intro-link" onClick={() => chooseSection("model")}>Open model settings <span>→</span></button>
            </div>
          )}

          <div className="results-bar">
            <span>{search || showChanged ? `${visibleOptions.length} matching settings` : `${visibleOptions.length} settings in view`}</span>
            <span className="results-rule" />
            <span className="results-help">Click any control to edit</span>
          </div>

          <div className="settings-list">
            {visibleOptions.length > 0 ? visibleOptions.map((option) => (
              <SettingRow
                key={option.key}
                option={option}
                value={valueFor(option, values)}
                changed={changedKeys.has(option.key)}
                onChange={(value) => updateValue(option.key, value)}
              />
            )) : (
              <div className="empty-state">
                <div className="empty-symbol">⌕</div>
                <strong>No settings found</strong>
                <p>Try a broader search, or clear the changed-only filter.</p>
                <button type="button" className="button button-quiet" onClick={() => { setSearch(""); setShowChanged(false); }}>Clear filters</button>
              </div>
            )}
          </div>

          <footer className="content-footer">
            <span>cfgdex <span className="footer-version">v0.1 prototype</span></span>
            <span>Local-first · no account required</span>
          </footer>
        </section>
      </div>
    </main>
  );
}
